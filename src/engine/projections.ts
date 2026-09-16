import { addMonths, differenceInCalendarMonths, startOfMonth } from 'date-fns';
import { amountSpread } from './amounts';
import { debtFlow } from './debts';
import { isIrregular, monthsPerPeriod } from './frequency';
import type { PlanMetrics } from './metrics';
import { activeExpenses } from './metrics';
import type { ExpenseItem, FinancialPlan, SavingsGoal } from './types';

/* ------------------------------------------------------------------ */
/* Upcoming irregular expenses (PRD §18.10)                            */
/* ------------------------------------------------------------------ */

export interface UpcomingExpense {
  id: string;
  /** Where the occurrence comes from: an expense item, or a loan paid quarterly or yearly. */
  source: 'expense' | 'debt';
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
export function upcomingExpenses(
  plan: FinancialPlan,
  now: Date = new Date(),
  horizonMonths = 12,
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
        name: e.name,
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
        name: d.name,
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
): MonthOutlook[] {
  const start = startOfMonth(now);
  const upcoming = upcomingExpenses(plan, now, horizonMonths);
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

export function goalProgress(goal: SavingsGoal, now: Date = new Date()): GoalProgress {
  const target = goal.targetAmount ?? 0;
  const remaining = Math.max(0, target - goal.currentAmount);
  const progress = target > 0 ? Math.min(1, goal.currentAmount / target) : 0;

  let monthsToTarget: number;
  if (target <= 0) monthsToTarget = Infinity;
  else if (remaining <= 0) monthsToTarget = 0;
  else if (goal.monthlyContribution <= 0) monthsToTarget = Infinity;
  else monthsToTarget = Math.ceil(remaining / goal.monthlyContribution);

  const completionDate = Number.isFinite(monthsToTarget) ? addMonths(now, monthsToTarget) : null;

  let requiredMonthly: number | null = null;
  let onTrack: boolean | null = null;
  if (goal.targetDate && target > 0 && remaining > 0) {
    const monthsLeft = Math.max(1, differenceInCalendarMonths(parseIso(goal.targetDate), now));
    requiredMonthly = remaining / monthsLeft;
    onTrack = goal.monthlyContribution >= requiredMonthly;
  }

  return { goal, progress, remaining, monthsToTarget, completionDate, requiredMonthly, onTrack };
}

export function allGoalProgress(plan: FinancialPlan, now: Date = new Date()): GoalProgress[] {
  return plan.goals.map((g) => goalProgress(g, now));
}

/* ------------------------------------------------------------------ */
/* 12-month projection (PRD §18.11)                                    */
/* ------------------------------------------------------------------ */

export interface ProjectionPoint {
  month: Date;
  /** Cumulative contributions since today. */
  added: number;
  /** Total savings (goal balances) at that point. */
  balance: number;
}

export function savingsProjection(
  plan: FinancialPlan,
  metrics: PlanMetrics,
  now: Date = new Date(),
  horizonMonths = 12,
  opts: { includeUnallocated?: boolean } = {},
): ProjectionPoint[] {
  const start = plan.goals.reduce((acc, g) => acc + g.currentAmount, 0);
  const perMonth = metrics.savings.total + (opts.includeUnallocated ? Math.max(0, metrics.breathingRoom) : 0);
  const out: ProjectionPoint[] = [];
  for (let i = 1; i <= horizonMonths; i += 1) {
    out.push({ month: addMonths(startOfMonth(now), i), added: perMonth * i, balance: start + perMonth * i });
  }
  return out;
}
