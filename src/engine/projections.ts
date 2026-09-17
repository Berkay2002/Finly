import { addMonths, differenceInCalendarMonths, startOfMonth } from 'date-fns';
import { messages } from '@/i18n';
import { amountSpread } from './amounts';
import { debtFlow, debtSchedule } from './debts';
import { isIrregular, monthsPerPeriod } from './frequency';
import { withMonthValue } from './history';
import type { PlanMetrics } from './metrics';
import { activeExpenses, monthKeyOf } from './metrics';
import type { GovBondRate } from './rates';
import { savingsPots } from './savings';
import { capitalTaxSummary, monthlyRate } from './tax/capital';
import { debtName, expenseName } from './taxonomy';
import type { ExpenseItem, FinancialPlan, SavingsGoal } from './types';

/* ------------------------------------------------------------------ */
/* Upcoming irregular expenses (PRD §18.10)                            */
/* ------------------------------------------------------------------ */

export interface UpcomingExpense {
  id: string;
  /**
   * Where the occurrence comes from: an expense item, a loan paid quarterly or yearly, or the tax on ISK and AF
   * funds settled in the final tax (`SAVINGS_TAX_ID`).
   */
  source: 'expense' | 'debt' | 'tax';
  /** Id of the expense item or loan. */
  expenseId: string;
  name: string;
  category: ExpenseItem['category'];
  date: Date;
  /** Typical amount of this occurrence. */
  amount: number;
  /** Expected low / high of this occurrence; equal to `amount` for fixed items. */
  low: number;
  high: number;
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/**
 * All occurrences of irregular expenses within the next `horizonMonths`.
 * Items without a date are placed at the end of the current month so that
 * they still appear in the calendar without a fabricated day.
 */
export const SAVINGS_TAX_ID = 'savings-tax';

/**
 * Tax on ISK (and on funds in an AF) is not withheld: it comes with the final tax (slutskatt) the spring after.
 * Placed on 12 May, the usual due date when the tax decision arrives in April; the KF refund nets against it.
 */
export function savingsTaxDue(plan: FinancialPlan, now: Date, gov?: GovBondRate): { year: number; date: Date; amount: number }[] {
  return [now.getFullYear() - 1, now.getFullYear()]
    .map((year) => ({ year, date: new Date(year + 1, 4, 12) }))
    .filter((t) => t.date >= startOfMonth(now))
    .map((t) => ({ ...t, amount: capitalTaxSummary(plan, now, gov, t.year).slutskatt }))
    .filter((t) => t.amount >= 1);
}

export function upcomingExpenses(
  plan: FinancialPlan,
  now: Date = new Date(),
  horizonMonths = 12,
  gov?: GovBondRate,
): UpcomingExpense[] {
  const start = startOfMonth(now);
  const end = addMonths(start, horizonMonths);
  const out: UpcomingExpense[] = [];

  for (const e of activeExpenses(plan)) {
    if (!isIrregular(e.frequency, e.occurrences)) continue;
    let date = e.nextDate ? parseIso(e.nextDate) : null;
    const step = monthsPerPeriod(e.frequency);

    if (!date) {
      // Undated recurring items: treat as due one period from now.
      if (e.frequency === 'once') continue;
      date = addMonths(start, step ?? 12);
    }

    // Roll forward past occurrences.
    if (step) {
      while (date < start) date = addMonths(date, step);
    } else if (date < start) {
      continue;
    }

    const spread = amountSpread(e);
    let guard = 0;
    while (date < end && guard < 24) {
      out.push({
        id: `${e.id}-${date.toISOString().slice(0, 10)}`,
        source: 'expense',
        expenseId: e.id,
        name: expenseName(e),
        category: e.category,
        date,
        amount: spread.typical,
        low: spread.low,
        high: spread.high,
      });
      if (!step) break;
      date = addMonths(date, step);
      guard += 1;
    }
  }

  // Loans paid quarterly or yearly (CSN's default schedule is four times a year).
  for (const d of plan.debts ?? []) {
    if (d.frequency === 'monthly') continue;
    const monthly = debtFlow(d).monthly;
    if (monthly <= 0) continue;
    const step = d.frequency === 'quarterly' ? 3 : 12;
    const first = d.nextDate ? parseIso(d.nextDate) : addMonths(start, step);
    // Step from the first date each time so a month-end due date does not drift (30 Nov → 28 Feb → 28 May).
    let k = 0;
    while (addMonths(first, k * step) < start) k += 1;
    const amount = monthly * step;
    for (let date = addMonths(first, k * step), guard = 0; date < end && guard < 24; guard += 1) {
      out.push({
        id: `${d.id}-${date.toISOString().slice(0, 10)}`,
        source: 'debt',
        expenseId: d.id,
        name: debtName(d),
        category: 'finance',
        date,
        amount,
        low: amount,
        high: amount,
      });
      k += 1;
      date = addMonths(first, k * step);
    }
  }

  for (const t of savingsTaxDue(plan, now, gov)) {
    if (t.date >= end) continue;
    out.push({
      id: `${SAVINGS_TAX_ID}-${t.year}`,
      source: 'tax',
      expenseId: SAVINGS_TAX_ID,
      name: messages().insights.engine.savingsTax(t.year),
      category: 'finance',
      date: t.date,
      amount: t.amount,
      low: t.amount,
      high: t.amount,
    });
  }

  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/* ------------------------------------------------------------------ */
/* Month outlook — expensive months                                    */
/* ------------------------------------------------------------------ */

export interface MonthOutlook {
  month: Date;
  /** Regular monthly spend + irregular occurrences in the month. */
  expected: number;
  /** Same with every variable item at its high — the month if all bills run hot. */
  expectedHigh: number;
  /** Difference vs. the normal (provisioned) monthly lifestyle cost. */
  aboveNormal: number;
  items: UpcomingExpense[];
}

export function monthOutlook(
  plan: FinancialPlan,
  metrics: PlanMetrics,
  now: Date = new Date(),
  horizonMonths = 12,
  gov?: GovBondRate,
): MonthOutlook[] {
  const start = startOfMonth(now);
  const upcoming = upcomingExpenses(plan, now, horizonMonths, gov);
  const irregularIds = new Set(
    activeExpenses(plan)
      .filter((e) => isIrregular(e.frequency, e.occurrences))
      .map((e) => e.id),
  );
  const regularLines = metrics.expenses.lines.filter((l) => !irregularIds.has(l.id));
  const monthlyDebt = (plan.debts ?? [])
    .filter((d) => d.frequency === 'monthly')
    .reduce((acc, d) => acc + debtFlow(d).monthly, 0);
  const regularSpend = regularLines.reduce((acc, l) => acc + l.monthly, 0) + monthlyDebt;
  const regularSpendHigh = regularLines.reduce((acc, l) => acc + l.monthlyHigh, 0) + monthlyDebt;

  const out: MonthOutlook[] = [];
  for (let i = 0; i < horizonMonths; i += 1) {
    const month = addMonths(start, i);
    const items = upcoming.filter(
      (u) => u.date.getFullYear() === month.getFullYear() && u.date.getMonth() === month.getMonth(),
    );
    const irregularThisMonth = items.reduce((a, b) => a + b.amount, 0);
    const irregularHigh = items.reduce((a, b) => a + b.high, 0);
    const expected = regularSpend + irregularThisMonth;
    const expectedHigh = regularSpendHigh + irregularHigh;
    out.push({ month, expected, expectedHigh, aboveNormal: expected - metrics.lifestyleCost, items });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Goals (PRD §18.9)                                                   */
/* ------------------------------------------------------------------ */

export interface GoalProgress {
  goal: SavingsGoal;
  progress: number; // 0..1, or 0 when no target
  remaining: number;
  /** Months until target at the current contribution. Infinity if never. */
  monthsToTarget: number;
  completionDate: Date | null;
  /** Required monthly contribution to hit targetDate, if one is set. */
  requiredMonthly: number | null;
  onTrack: boolean | null;
}

/** Longest a goal is simulated with returns before it counts as never reached: 50 years. */
const MAX_GOAL_MONTHS = 600;

/**
 * `yearlyReturn` is the expected return after tax of the goal's linked account, percent (0 when not linked):
 * the balance compounds monthly and the contribution is added at each month's end.
 */
export function goalProgress(goal: SavingsGoal, now: Date = new Date(), yearlyReturn = 0): GoalProgress {
  const target = goal.targetAmount ?? 0;
  const remaining = Math.max(0, target - goal.currentAmount);
  const progress = target > 0 ? Math.min(1, goal.currentAmount / target) : 0;
  const r = monthlyRate(yearlyReturn);
  const contribution = Math.max(0, goal.monthlyContribution);

  let monthsToTarget: number;
  if (target <= 0) monthsToTarget = Infinity;
  else if (remaining <= 0) monthsToTarget = 0;
  else if (r === 0) monthsToTarget = contribution <= 0 ? Infinity : Math.ceil(remaining / contribution);
  else {
    monthsToTarget = Infinity;
    let balance = goal.currentAmount;
    for (let m = 1; m <= MAX_GOAL_MONTHS; m += 1) {
      balance = balance * (1 + r) + contribution;
      if (balance >= target) {
        monthsToTarget = m;
        break;
      }
    }
  }

  const completionDate = Number.isFinite(monthsToTarget) ? addMonths(now, monthsToTarget) : null;

  let requiredMonthly: number | null = null;
  let onTrack: boolean | null = null;
  if (goal.targetDate && target > 0 && remaining > 0) {
    const monthsLeft = Math.max(1, differenceInCalendarMonths(parseIso(goal.targetDate), now));
    if (r === 0) requiredMonthly = remaining / monthsLeft;
    else {
      // Contribution c such that current × (1 + r)^n + c × ((1 + r)^n − 1) / r reaches the target.
      const growth = Math.pow(1 + r, monthsLeft);
      requiredMonthly = Math.max(0, ((target - goal.currentAmount * growth) * r) / (growth - 1));
    }
    onTrack = goal.monthlyContribution >= requiredMonthly;
  }

  return { goal, progress, remaining, monthsToTarget, completionDate, requiredMonthly, onTrack };
}

/** Expected yearly return after tax for each account, percent, by account id. */
export function accountReturns(plan: FinancialPlan, now: Date, gov?: GovBondRate): Map<string, number> {
  const summary = capitalTaxSummary(plan, now, gov);
  return new Map(summary.accounts.map((t) => [t.accountId, t.netReturn]));
}

/** The after-tax return a goal or pot earns through its account, percent; 0 when it has none. */
export function goalReturn(goal: SavingsGoal, returns: Map<string, number>): number {
  return goal.linkedAccountId ? (returns.get(goal.linkedAccountId) ?? 0) : 0;
}

export function allGoalProgress(plan: FinancialPlan, now: Date = new Date(), gov?: GovBondRate): GoalProgress[] {
  const returns = accountReturns(plan, now, gov);
  return savingsPots(plan).map((g) => goalProgress(g, now, goalReturn(g, returns)));
}

/* ------------------------------------------------------------------ */
/* 12-month projection (PRD §18.11)                                    */
/* ------------------------------------------------------------------ */

export interface ProjectionPoint {
  month: Date;
  /** Cumulative contributions since today. */
  added: number;
  /** Total savings (savings accounts and goals) at that point. */
  balance: number;
  /** `balance` plus the expected return after tax earned by savings held in an account with a return. */
  withReturns: number;
}

export function savingsProjection(
  plan: FinancialPlan,
  metrics: PlanMetrics,
  now: Date = new Date(),
  horizonMonths = 12,
  opts: { includeUnallocated?: boolean; gov?: GovBondRate } = {},
): ProjectionPoint[] {
  const pots = savingsPots(plan);
  const start = pots.reduce((acc, g) => acc + g.currentAmount, 0);
  const extra = opts.includeUnallocated ? Math.max(0, metrics.breathingRoom) : 0;
  const perMonth = metrics.savings.total + extra;
  const returns = accountReturns(plan, now, opts.gov);
  const growing = pots.map((g) => ({
    balance: g.currentAmount,
    contribution: Math.max(0, g.monthlyContribution),
    r: monthlyRate(goalReturn(g, returns)),
  }));
  let unallocated = 0;
  const out: ProjectionPoint[] = [];
  for (let i = 1; i <= horizonMonths; i += 1) {
    for (const g of growing) g.balance = g.balance * (1 + g.r) + g.contribution;
    unallocated += extra;
    out.push({
      month: addMonths(startOfMonth(now), i),
      added: perMonth * i,
      balance: start + perMonth * i,
      withReturns: growing.reduce((s, g) => s + g.balance, 0) + unallocated,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Forward view: the plan as it should stand in a later month          */
/* ------------------------------------------------------------------ */

/** Whole months from the month of `from` to the month of `to`; 0 or less when `to` is not in a later month. */
export function monthsAhead(from: Date, to: Date): number {
  return differenceInCalendarMonths(startOfMonth(to), startOfMonth(from));
}

/**
 * The plan as it should stand in the month of `to`, seen from `from` (today). Each month in between an
 * account takes its monthly deposit, a goal saved outside any account takes its contribution, and a loan
 * follows its repayment schedule (interest, then the payment). The return on savings is expected, not
 * promised, so it is left out unless `withReturns` is set: then each account also grows by its return
 * after tax. The months passed are written into the balance history so the tax on savings and the payoff
 * sums see them. Unchanged when `to` is not in a later month than `from`.
 */
export function projectPlan(
  plan: FinancialPlan,
  from: Date,
  to: Date,
  gov?: GovBondRate,
  { withReturns = false }: { withReturns?: boolean } = {},
): FinancialPlan {
  const n = monthsAhead(from, to);
  if (n <= 0) return plan;
  const keyAt = (i: number) => monthKeyOf(addMonths(startOfMonth(from), i));
  const returns = withReturns ? accountReturns(plan, from, gov) : new Map<string, number>();

  /** Runs `step` `n` times from `start`, recording each month's value and the starting value under today's month. */
  const roll = (history: Record<string, number> | undefined, start: number, step: (v: number, i: number) => number) => {
    let balances = history?.[keyAt(0)] === undefined ? withMonthValue(history, keyAt(0), start) : { ...history };
    let value = start;
    for (let i = 1; i <= n; i += 1) {
      value = step(value, i);
      balances = withMonthValue(balances, keyAt(i), value);
    }
    return { value, balances };
  };

  const accounts = plan.accounts.map((a) => {
    const r = monthlyRate(returns.get(a.id) ?? 0);
    const deposit = Math.max(0, a.monthlyDeposit ?? 0);
    const { value, balances } = roll(a.balances, a.balance, (v) => v * (1 + r) + deposit);
    return { ...a, balance: value, balances };
  });

  const goals = plan.goals.map((g) => {
    if (g.linkedAccountId) return g;
    const contribution = Math.max(0, g.monthlyContribution);
    const { value, balances } = roll(g.balances, g.currentAmount, (v) => v + contribution);
    return { ...g, currentAmount: value, balances };
  });

  const debts = plan.debts?.map((d) => {
    const rows = debtSchedule(d, from, n);
    const { value, balances } = roll(d.balances, d.balance, (_, i) => rows[i - 1]?.balance ?? d.balance);
    return { ...d, balance: value, balances };
  });

  return { ...plan, accounts, goals, ...(debts ? { debts } : {}) };
}

/**
 * The forecast (prognos) part of a later month: the return after tax the accounts are expected to have
 * earned by the month of `to`, on top of what is put in. An expectation, not a promise, so it is shown
 * beside net worth rather than counted in it. 0 when `to` is not in a later month.
 */
export function expectedReturnsBy(plan: FinancialPlan, from: Date, to: Date, gov?: GovBondRate): number {
  if (monthsAhead(from, to) <= 0) return 0;
  const grown = projectPlan(plan, from, to, gov, { withReturns: true }).accounts;
  const saved = projectPlan(plan, from, to, gov).accounts;
  return grown.reduce((sum, a, i) => sum + a.balance - saved[i].balance, 0);
}
