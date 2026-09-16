import { getDaysInMonth } from 'date-fns';
import { amountSpread, monthlySpread } from './amounts';
import { toMonthly } from './frequency';
import { accountRole, type AccountRole } from './taxonomy';
import type { ExpenseCategory, ExpenseItem, ExpenseTag, FinancialPlan } from './types';
import { EXPENSE_CATEGORIES } from './types';

/* ------------------------------------------------------------------ */
/* Output shape                                                        */
/* ------------------------------------------------------------------ */

export interface CostLine {
  id: string;
  name: string;
  category: ExpenseCategory;
  /** Typical monthly equivalent — the figure the plan budgets for. */
  monthly: number;
  annual: number;
  /** Monthly equivalents of the expected low and high. Equal to `monthly` for fixed items. */
  monthlyLow: number;
  monthlyHigh: number;
  /** True when the cost has a real spread between periods. */
  varies: boolean;
  essential: boolean;
  committed: boolean;
  fixed: boolean;
}

/** Best and worst case of one figure, from the ranges on variable items. */
export interface Range {
  low: number;
  high: number;
}

/** A variable monthly item whose bill is paid in the viewed month. */
export interface PendingBill extends CostLine {
  /** YYYY-MM the bill covers; earlier than the paid month when the item bills in arrears. */
  periodMonth: string;
  billingLag: number;
}

/** A pending bill whose real amount has been entered. */
export interface ActualLine extends PendingBill {
  actual: number;
  /** actual − typical monthly. Positive means the bill ran above plan. */
  variance: number;
}

/**
 * Where the viewed month stands against the estimates. Variable items are guesses until the
 * bill arrives; once entered, the month runs on the real figure.
 */
export interface MonthActuals {
  /** YYYY-MM of the viewed month. */
  month: string;
  confirmed: ActualLine[];
  /** Variable monthly items still waiting for the bill paid this month. */
  pending: PendingBill[];
  /** Σ (actual − typical) over confirmed items. */
  variance: number;
  /** Normal lifestyle cost with confirmed bills substituted for their estimates. */
  lifestyleCost: number;
  /** Same, but with pending items at their low / high bound. */
  lifestyleRange: Range;
}

export interface PlanMetrics {
  income: {
    reliable: number;
    variable: number;
    total: number;
    /** Sources marked "not in baseline", shown but excluded. */
    excluded: number;
  };
  expenses: {
    byCategory: Record<ExpenseCategory, number>;
    total: number;
    essential: number;
    optional: number;
    fixed: number;
    variable: number;
    committed: number;
    flexible: number;
    lines: CostLine[];
  };
  /**
   * Spread of the normal month when every variable item runs at its low or its high.
   * `hasRanges` is false when nothing in the plan has a range, in which case low = high.
   */
  range: {
    hasRanges: boolean;
    lifestyleCost: Range;
    essentialCost: Range;
    byCategory: Record<ExpenseCategory, Range>;
    /** Income − savings − lifestyle at its high (low) / low (high). */
    breathingRoom: Range;
    /** Breathing room range minus one-offs this month, with confirmed bills fixed at their actual. */
    safeToSpend: Range;
    /** lifestyleCost.high − lifestyleCost.low: how much a normal month can swing. */
    swing: number;
  };
  /** Confirmed and pending bills for the viewed month. */
  actuals: MonthActuals;
  savings: {
    futureSpending: number;
    longTerm: number;
    total: number;
    /** Share of total income. */
    rate: number;
    /** Share of reliable income (PRD §18.7). */
    rateOfReliable: number;
  };
  /** PRD §15 */
  essentialCost: number;
  lifestyleCost: number;
  plannedCost: number;
  /** PRD §18.24 / §18.12 — income minus lifestyle minus savings. */
  breathingRoom: number;
  /**
   * PRD §18.1 — breathing room minus one-off costs dated in the current month, adjusted by
   * how far confirmed bills landed from their estimates.
   */
  safeToSpend: number;
  oneOffsThisMonth: number;
  /** PRD §18.27 */
  allocation: {
    lifestyle: number;
    futureSpending: number;
    longTerm: number;
    unallocated: number;
  };
  /** PRD §13 / §19 */
  position: {
    everyday: number;
    cashSavings: number;
    emergency: number;
    investments: number;
    other: number;
    cashInBank: number;
    totalAssets: number;
    byRole: Record<AccountRole, number>;
  };
  /** PRD §18.25 / §18.26 / §18.14 */
  resilience: {
    emergencyMonths: number;
    essentialRunwayMonths: number;
    lifestyleRunwayMonths: number;
    availableForRunway: number;
    reliableCoversEssentials: boolean;
    reliableCoversLifestyle: boolean;
    /** reliable income − essential cost; negative means variable income is needed for essentials. */
    essentialMargin: number;
  };
  /** PRD §18.3 / §18.23 */
  topCosts: CostLine[];
  /** PRD §18.22 */
  subscriptions: { monthly: number; annual: number; lines: CostLine[] };
  /** PRD §18.21 */
  car: { monthly: number; annual: number; lines: CostLine[] };
  /** PRD §18.15 — optional and flexible, largest first. */
  reducible: CostLine[];
  /** PRD §18.18 */
  daily: {
    flexibleBudget: number;
    perDay: number;
    perWeek: number;
    daysInMonth: number;
    daysRemaining: number;
    remaining: number;
  };
  /** True when the plan has enough data to say anything useful. */
  hasIncome: boolean;
  hasExpenses: boolean;
  hasAccounts: boolean;
  hasGoals: boolean;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function monthlyOf(item: { amount: number; frequency: ExpenseItem['frequency'] }): number {
  return toMonthly(item.amount, item.frequency);
}

/** Typical amount per period: `amount`, or the midpoint of the range when only a range was given. */
export function typicalAmount(e: ExpenseItem): number {
  return amountSpread(e).typical;
}

export function activeExpenses(plan: FinancialPlan): ExpenseItem[] {
  return plan.expenses.filter((e) => !e.includedElsewhere && typicalAmount(e) > 0);
}

export function toCostLine(e: ExpenseItem): CostLine {
  const s = monthlySpread(e);
  return {
    id: e.id,
    name: e.name,
    category: e.category,
    monthly: s.typical,
    annual: s.typical * 12,
    monthlyLow: s.low,
    monthlyHigh: s.high,
    varies: s.high > s.low,
    essential: e.essential,
    committed: e.committed,
    fixed: e.fixed,
  };
}

/** YYYY-MM key used for `ExpenseItem.actuals`. */
export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** The entered bill for an item in a month, if any. */
export function actualFor(e: ExpenseItem, month: string): number | undefined {
  const v = e.actuals?.[month];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
}

/** Whether an item is the kind whose bill we ask the user to confirm each month. */
export function awaitsActual(e: ExpenseItem): boolean {
  return !e.fixed && e.frequency === 'monthly' && !e.includedElsewhere && typicalAmount(e) > 0;
}

export function billingLagOf(e: { billingLag?: number; fixed?: boolean }): number {
  if (e.fixed) return 0;
  const n = e.billingLag ?? 0;
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Month (YYYY-MM) that a bill paid in `paidMonth` covers, given the item's billing lag. */
export function billPeriodFor(e: { billingLag?: number; fixed?: boolean }, paidMonth: string): string {
  const lag = billingLagOf(e);
  const [y, m] = paidMonth.split('-').map(Number);
  const d = new Date(y, (m ?? 1) - 1 - lag, 1);
  return monthKeyOf(d);
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

function safeDiv(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return a > 0 ? Infinity : 0;
  return a / b;
}

function hasTag(e: ExpenseItem, tag: ExpenseTag): boolean {
  return e.tags.includes(tag);
}

function isDatedInMonth(iso: string | undefined, now: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

export function computeMetrics(plan: FinancialPlan, now: Date = new Date()): PlanMetrics {
  /* Income */
  const baseline = plan.income.filter((i) => i.includeInBaseline && i.amount > 0);
  const reliable = sum(baseline.filter((i) => i.reliability === 'reliable').map(monthlyOf));
  const variable = sum(baseline.filter((i) => i.reliability === 'variable').map(monthlyOf));
  const excluded = sum(plan.income.filter((i) => !i.includeInBaseline).map(monthlyOf));
  const totalIncome = reliable + variable;

  /* Expenses */
  const active = activeExpenses(plan);
  const lines = active.map(toCostLine);
  const byCategory = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, 0])) as Record<
    ExpenseCategory,
    number
  >;
  for (const l of lines) byCategory[l.category] += l.monthly;

  const expenseTotal = sum(lines.map((l) => l.monthly));
  const essential = sum(lines.filter((l) => l.essential).map((l) => l.monthly));
  const fixed = sum(lines.filter((l) => l.fixed).map((l) => l.monthly));
  const committed = sum(lines.filter((l) => l.committed).map((l) => l.monthly));

  /* Ranges — best and worst normal month */
  const rangeOf = (ls: CostLine[]): Range => ({
    low: sum(ls.map((l) => l.monthlyLow)),
    high: sum(ls.map((l) => l.monthlyHigh)),
  });
  const lifestyleRange = rangeOf(lines);
  const essentialRange = rangeOf(lines.filter((l) => l.essential));
  const byCategoryRange = Object.fromEntries(
    EXPENSE_CATEGORIES.map((c) => [c, rangeOf(lines.filter((l) => l.category === c))]),
  ) as Record<ExpenseCategory, Range>;
  const hasRanges = lines.some((l) => l.varies);

  /* Actuals — bills confirmed for the viewed month */
  const month = monthKeyOf(now);
  const byId = new Map(lines.map((l) => [l.id, l]));
  const confirmed: ActualLine[] = [];
  const pending: PendingBill[] = [];
  for (const e of active) {
    const line = byId.get(e.id);
    if (!line) continue;
    const actual = actualFor(e, month);
    const bill: PendingBill = { ...line, periodMonth: billPeriodFor(e, month), billingLag: billingLagOf(e) };
    if (actual !== undefined) {
      confirmed.push({ ...bill, actual, variance: actual - line.monthly });
    } else if (awaitsActual(e)) {
      pending.push(bill);
    }
  }
  const confirmedIds = new Set(confirmed.map((l) => l.id));
  const actualVariance = sum(confirmed.map((l) => l.variance));
  const monthLifestyle = expenseTotal + actualVariance;
  const monthLifestyleRange: Range = {
    low: sum(lines.map((l) => (confirmedIds.has(l.id) ? l.monthly : l.monthlyLow))) + actualVariance,
    high: sum(lines.map((l) => (confirmedIds.has(l.id) ? l.monthly : l.monthlyHigh))) + actualVariance,
  };

  /* Savings */
  const goals = plan.goals.filter((g) => g.monthlyContribution > 0);
  const futureSpending = sum(
    goals.filter((g) => g.purpose === 'future_spending').map((g) => g.monthlyContribution),
  );
  const longTerm = sum(goals.filter((g) => g.purpose === 'long_term').map((g) => g.monthlyContribution));
  const savingsTotal = futureSpending + longTerm;

  /* Core numbers */
  const lifestyleCost = expenseTotal;
  const plannedCost = lifestyleCost + savingsTotal;
  const breathingRoom = totalIncome - plannedCost;
  const oneOffsThisMonth = sum(
    active.filter((e) => e.frequency === 'once' && isDatedInMonth(e.nextDate, now)).map(typicalAmount),
  );
  const safeToSpend = breathingRoom - oneOffsThisMonth - actualVariance;
  const breathingRoomRange: Range = {
    low: totalIncome - savingsTotal - lifestyleRange.high,
    high: totalIncome - savingsTotal - lifestyleRange.low,
  };
  const safeToSpendRange: Range = {
    low: totalIncome - savingsTotal - monthLifestyleRange.high - oneOffsThisMonth,
    high: totalIncome - savingsTotal - monthLifestyleRange.low - oneOffsThisMonth,
  };

  /* Position */
  const byRole: Record<AccountRole, number> = {
    everyday: 0,
    cash_savings: 0,
    emergency: 0,
    investment: 0,
    other: 0,
  };
  for (const a of plan.accounts) byRole[accountRole(a.kind)] += a.balance;
  const cashInBank = byRole.everyday + byRole.cash_savings;
  const totalAssets = sum(Object.values(byRole));

  /* Resilience */
  const availableForRunway = cashInBank + byRole.emergency;
  const essentialMargin = reliable - essential;

  /* Analyses */
  const sortedLines = [...lines].sort((a, b) => b.monthly - a.monthly);
  const subLines = active.filter((e) => hasTag(e, 'subscription')).map(toCostLine);
  const carLines = active.filter((e) => hasTag(e, 'car')).map(toCostLine);
  const reducible = sortedLines.filter((l) => !l.essential && !l.committed);

  /* Daily */
  const daysInMonth = getDaysInMonth(now);
  const daysRemaining = Math.max(1, daysInMonth - now.getDate() + 1);
  const flexibleSpend = expenseTotal - committed;
  const flexibleBudget = Math.max(0, flexibleSpend + safeToSpend);
  const remaining = flexibleBudget * (daysRemaining / daysInMonth);
  const perDay = flexibleBudget / daysInMonth;

  return {
    income: { reliable, variable, total: totalIncome, excluded },
    expenses: {
      byCategory,
      total: expenseTotal,
      essential,
      optional: expenseTotal - essential,
      fixed,
      variable: expenseTotal - fixed,
      committed,
      flexible: flexibleSpend,
      lines,
    },
    range: {
      hasRanges,
      lifestyleCost: lifestyleRange,
      essentialCost: essentialRange,
      byCategory: byCategoryRange,
      breathingRoom: breathingRoomRange,
      safeToSpend: safeToSpendRange,
      swing: lifestyleRange.high - lifestyleRange.low,
    },
    actuals: {
      month,
      confirmed,
      pending,
      variance: actualVariance,
      lifestyleCost: monthLifestyle,
      lifestyleRange: monthLifestyleRange,
    },
    savings: {
      futureSpending,
      longTerm,
      total: savingsTotal,
      rate: totalIncome > 0 ? savingsTotal / totalIncome : 0,
      rateOfReliable: reliable > 0 ? savingsTotal / reliable : 0,
    },
    essentialCost: essential,
    lifestyleCost,
    plannedCost,
    breathingRoom,
    safeToSpend,
    oneOffsThisMonth,
    allocation: {
      lifestyle: totalIncome > 0 ? lifestyleCost / totalIncome : 0,
      futureSpending: totalIncome > 0 ? futureSpending / totalIncome : 0,
      longTerm: totalIncome > 0 ? longTerm / totalIncome : 0,
      unallocated: totalIncome > 0 ? Math.max(0, breathingRoom) / totalIncome : 0,
    },
    position: {
      everyday: byRole.everyday,
      cashSavings: byRole.cash_savings,
      emergency: byRole.emergency,
      investments: byRole.investment,
      other: byRole.other,
      cashInBank,
      totalAssets,
      byRole,
    },
    resilience: {
      emergencyMonths: safeDiv(byRole.emergency, essential),
      essentialRunwayMonths: safeDiv(availableForRunway, essential),
      lifestyleRunwayMonths: safeDiv(availableForRunway, lifestyleCost),
      availableForRunway,
      reliableCoversEssentials: reliable >= essential,
      reliableCoversLifestyle: reliable >= lifestyleCost,
      essentialMargin,
    },
    topCosts: sortedLines.slice(0, 8),
    subscriptions: {
      monthly: sum(subLines.map((l) => l.monthly)),
      annual: sum(subLines.map((l) => l.annual)),
      lines: subLines.sort((a, b) => b.monthly - a.monthly),
    },
    car: {
      monthly: sum(carLines.map((l) => l.monthly)),
      annual: sum(carLines.map((l) => l.annual)),
      lines: carLines.sort((a, b) => b.monthly - a.monthly),
    },
    reducible,
    daily: {
      flexibleBudget,
      perDay,
      perWeek: perDay * 7,
      daysInMonth,
      daysRemaining,
      remaining,
    },
    hasIncome: totalIncome > 0,
    hasExpenses: expenseTotal > 0,
    hasAccounts: plan.accounts.length > 0,
    hasGoals: plan.goals.length > 0,
  };
}
