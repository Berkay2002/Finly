import { endOfMonth, subMonths } from 'date-fns';
import { computeMetrics, monthKeyOf } from './metrics';
import { SPEND_GROUPS } from './everyday';
import { savingsPots } from './savings';
import type { FinancialPlan, SpendGroup } from './types';

/**
 * Tracking Mode: a month's numbers frozen at its close so later months can show what changed and
 * later plan edits do not rewrite the past. Older snapshots lack the optional fields.
 */
export interface MetricsSnapshot {
  month: string; // YYYY-MM
  savedAt: string;
  income: number;
  /** Planned (baseline) lifestyle cost. */
  lifestyleCost: number;
  /** Lifestyle cost with that month's confirmed bills substituted. Missing on older snapshots. */
  lifestyleCostActual?: number;
  /** Σ (actual − typical) over confirmed bills that month. */
  actualVariance?: number;
  /** How many bills were confirmed when the snapshot was taken. */
  billsConfirmed?: number;
  /** Everyday spending by group: planned per month, and what was spent when the month was logged in full. */
  everydayPlanned?: Partial<Record<SpendGroup, number>>;
  everydaySpent?: Partial<Record<SpendGroup, number>>;
  savings: number;
  breathingRoom: number;
  safeToSpend: number;
  totalAssets: number;
  cashInBank: number;
  investments: number;
  emergency?: number;
  /** Loans at close. Missing on snapshots from before loans had their own model. */
  totalDebt?: number;
  netWorth?: number;
  /** Monthly loan payments (included in `lifestyleCost`). */
  debtPayments?: number;
  savingsRate: number;
  byCategory: Record<string, number>;
  /** Account id → balance at close. */
  byAccount?: Record<string, number>;
  /** Loan id → balance at close. */
  byDebt?: Record<string, number>;
  /** Goal id → amount saved at close. */
  byGoal?: Record<string, number>;
  /** The plan as it stood at close (see `freezePlan`). Absent on snapshots from before Tracking Mode. */
  plan?: FinancialPlan;
}

export type SnapshotMap = Record<string, MetricsSnapshot>;

const KEY = /^\d{4}-\d{2}$/;

export function isMonthKey(key: string): boolean {
  return KEY.test(key);
}

/** First day of the month a YYYY-MM key names, in local time. */
export function monthStart(key: string): Date {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

/** Last day of the month a YYYY-MM key names. */
export function endOfMonthDate(key: string): Date {
  return endOfMonth(monthStart(key));
}

/** The "now" a month's snapshot is computed with: today for the running month, else its last day. */
export function snapshotDateFor(key: string, today: Date = new Date()): Date {
  return key === monthKeyOf(today) ? today : endOfMonthDate(key);
}

/** Sets `map[month] = value`, returning a new map. */
export function withMonthValue(map: Record<string, number> | undefined, month: string, value: number): Record<string, number> {
  return { ...(map ?? {}), [month]: value };
}

/**
 * A copy of the plan reduced to what that month's metrics need: the bill for that month only,
 * and no balance history (the snapshot's `byAccount` / `byGoal` hold those values).
 */
export function freezePlan(plan: FinancialPlan, month: string): FinancialPlan {
  const copy = structuredClone(plan);
  copy.isSample = undefined;
  delete copy.avatar; // every closed month would otherwise carry its own copy of the picture
  copy.expenses = copy.expenses.map((e) => {
    const bill = e.actuals?.[month];
    const { actuals: _drop, ...rest } = e;
    void _drop;
    return typeof bill === 'number' ? { ...rest, actuals: { [month]: bill } } : rest;
  });
  const spend: NonNullable<FinancialPlan['everydaySpend']> = {};
  for (const g of SPEND_GROUPS) {
    const entry = copy.everydaySpend?.[g]?.[month];
    if (entry) spend[g] = { [month]: entry };
  }
  if (Object.keys(spend).length > 0) copy.everydaySpend = spend;
  else delete copy.everydaySpend;
  copy.accounts = copy.accounts.map(({ balances: _b, ...rest }) => {
    void _b;
    return rest;
  });
  copy.goals = copy.goals.map(({ balances: _b, ...rest }) => {
    void _b;
    return rest;
  });
  if (copy.debts) {
    copy.debts = copy.debts.map(({ balances: _b, ...rest }) => {
      void _b;
      return rest;
    });
  }
  return copy;
}

export function buildSnapshot(plan: FinancialPlan, month: string, today: Date = new Date()): MetricsSnapshot {
  const m = computeMetrics(plan, snapshotDateFor(month, today));
  return {
    month,
    savedAt: today.toISOString(),
    income: m.income.total,
    lifestyleCost: m.lifestyleCost,
    lifestyleCostActual: m.actuals.lifestyleCost,
    actualVariance: m.actuals.variance,
    billsConfirmed: m.actuals.confirmed.length,
    everydayPlanned: Object.fromEntries(SPEND_GROUPS.map((g) => [g, m.everyday[g].monthly])),
    everydaySpent: Object.fromEntries(
      SPEND_GROUPS.flatMap((g) => (m.everyday[g].month.complete ? [[g, m.everyday[g].month.spent ?? 0]] : [])),
    ),
    savings: m.savings.total,
    breathingRoom: m.breathingRoom,
    safeToSpend: m.safeToSpend,
    totalAssets: m.position.totalAssets,
    cashInBank: m.position.cashInBank,
    investments: m.position.investments,
    emergency: m.position.emergency,
    totalDebt: m.position.totalDebt,
    netWorth: m.position.netWorth,
    debtPayments: m.debt.monthly,
    savingsRate: m.savings.rate,
    byCategory: { ...m.expenses.byCategory },
    byAccount: Object.fromEntries(plan.accounts.map((a) => [a.id, a.balance])),
    byDebt: Object.fromEntries((plan.debts ?? []).map((d) => [d.id, d.balance])),
    byGoal: Object.fromEntries(savingsPots(plan).map((g) => [g.id, g.currentAmount])),
    plan: freezePlan(plan, month),
  };
}

/** Saved by hand while its month was still running; the automatic close replaces it. */
export function isProvisional(snap: MetricsSnapshot): boolean {
  return snap.plan !== undefined && monthKeyOf(new Date(snap.savedAt)) === snap.month;
}

/** A past month whose snapshot carries a frozen plan renders from that plan, not the live one. */
export function isFrozen(snapshots: SnapshotMap, key: string, now: Date = new Date()): boolean {
  return key < monthKeyOf(now) && snapshots[key]?.plan !== undefined;
}

/**
 * Months that should be closed now, oldest first: every month from the plan's creation (capped at
 * `maxMonths` back) up to last month that has no snapshot or only a provisional one. Snapshots
 * from before Tracking Mode (no frozen plan) are history and are left alone. The demo plan and
 * plans still in onboarding never close.
 */
export function monthsToClose(
  plan: FinancialPlan,
  snapshots: SnapshotMap,
  now: Date = new Date(),
  opts: { maxMonths?: number } = {},
): string[] {
  const { maxMonths = 12 } = opts;
  if (plan.isSample || !plan.onboarding.completed) return [];
  const last = monthKeyOf(subMonths(now, 1));
  const created = new Date(plan.createdAt);
  const createdKey = Number.isNaN(created.getTime()) ? last : monthKeyOf(created);
  const floor = monthKeyOf(subMonths(now, maxMonths));
  const first = createdKey > floor ? createdKey : floor;
  if (first > last) return [];

  const out: string[] = [];
  for (let d = monthStart(first); ; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const key = monthKeyOf(d);
    if (key > last) break;
    const existing = snapshots[key];
    if (!existing || isProvisional(existing)) out.push(key);
  }
  return out;
}
