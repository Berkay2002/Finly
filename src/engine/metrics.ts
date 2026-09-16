import { getDaysInMonth } from 'date-fns';
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
  monthly: number;
  annual: number;
  essential: boolean;
  committed: boolean;
  fixed: boolean;
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
  /** PRD §18.1 — breathing room minus one-off costs dated in the current month. */
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

export function activeExpenses(plan: FinancialPlan): ExpenseItem[] {
  return plan.expenses.filter((e) => !e.includedElsewhere && e.amount > 0);
}

export function toCostLine(e: ExpenseItem): CostLine {
  const monthly = monthlyOf(e);
  return {
    id: e.id,
    name: e.name,
    category: e.category,
    monthly,
    annual: monthly * 12,
    essential: e.essential,
    committed: e.committed,
    fixed: e.fixed,
  };
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
    active.filter((e) => e.frequency === 'once' && isDatedInMonth(e.nextDate, now)).map((e) => e.amount),
  );
  const safeToSpend = breathingRoom - oneOffsThisMonth;

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
