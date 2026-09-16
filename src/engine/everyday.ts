import { getDaysInMonth } from 'date-fns';
import { amountSpread, monthlySpread } from './amounts';
import { monthlyToDaily, monthlyToWeekly, occurrencesPerMonth, periodsPerMonth } from './frequency';
import { isEverydaySpend, suggestionBySlug } from './taxonomy';
import type { ExpenseCategory, ExpenseItem, Occurrences, SpendEntry, SpendGroup } from './types';

/* ------------------------------------------------------------------ */
/* Groups                                                              */
/* ------------------------------------------------------------------ */

export const SPEND_GROUPS: SpendGroup[] = ['food', 'transport', 'leisure'];

export const SPEND_GROUP_META: Record<
  SpendGroup,
  { label: string; /** Lower-case, for "What did you spend on … in August?" */ noun: string; bankHint: string; category: ExpenseCategory }
> = {
  food: {
    label: 'Food & drink',
    noun: 'food',
    bankHint: 'Most bank apps total this under a food or groceries category.',
    category: 'living',
  },
  transport: {
    label: 'Getting around',
    noun: 'getting around',
    bankHint: 'Fuel, charging, parking, tickets and taxis. Most bank apps total these under transport.',
    category: 'transport',
  },
  leisure: {
    label: 'Fun & leisure',
    noun: 'fun and leisure',
    bankHint: 'Nights out, cinema, events and hobbies. Often under entertainment or leisure in the bank app.',
    category: 'leisure',
  },
};

export function isFoodItem(e: Pick<ExpenseItem, 'subcategory'>): boolean {
  return suggestionBySlug(e.subcategory)?.group === 'Food & drink';
}

/**
 * The everyday spending an item is logged under: all of Food & drink, plus the everyday items of
 * Transport (and the travel card, which the bank app counts as transport too) and Leisure.
 */
export function spendGroupOf(e: Pick<ExpenseItem, 'subcategory' | 'category' | 'occurrences'>): SpendGroup | null {
  if (isFoodItem(e)) return 'food';
  if (e.category === 'transport' && (e.subcategory === 'travel_card' || isEverydaySpend(e))) return 'transport';
  if (e.category === 'leisure' && isEverydaySpend(e)) return 'leisure';
  return null;
}

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

/** One fewer purchase of an item bought several times a period, and what that frees up. */
export interface SpendNudge {
  id: string;
  name: string;
  per: Occurrences['per'];
  /** Purchases per period now. */
  times: number;
  /** Monthly saving from one fewer purchase per period. */
  monthly: number;
}

/** Where the month's spending in a group stands against the plan. */
export interface SpendMonth {
  month: string;
  /** Typical spending per month in the plan. */
  planned: number;
  spent?: number;
  /** Day the logged total runs to (1-based), or the last day once complete. */
  day: number;
  daysInMonth: number;
  /** True when the logged total covers the whole month. */
  complete: boolean;
  /** Planned × share of the month gone by `day`. */
  expectedByNow: number;
  /** Where the month ends if spending keeps this pace; the total itself once complete. */
  projected?: number;
  /** projected − planned. */
  variance?: number;
  /** Planned − spent (negative when over). */
  left?: number;
  /** What is left spread over the remaining days. */
  leftPerDay?: number;
}

export interface SpendHistory {
  /** Complete months, newest first. */
  months: { month: string; amount: number }[];
  /** Average of the last `basedOn` complete months. */
  average: number;
  basedOn: number;
  /** average − planned, when there are at least two months and it is a noticeable gap; else null. */
  gap: number | null;
}

export interface SpendSummary {
  group: SpendGroup;
  /** Typical spending per month. */
  monthly: number;
  low: number;
  high: number;
  weekly: number;
  daily: number;
  /** Spending you could realistically change soon (not committed). */
  flexible: number;
  itemIds: string[];
  nudges: SpendNudge[];
  month: SpendMonth;
  history: SpendHistory;
}

/* ------------------------------------------------------------------ */
/* Logged months                                                       */
/* ------------------------------------------------------------------ */

const KEY = /^\d{4}-\d{2}$/;

function lastDayKey(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(getDaysInMonth(new Date(y, m - 1, 1))).padStart(2, '0')}`;
}

/** Whether a logged total covers the whole month. */
export function isCompleteEntry(entry: SpendEntry, month: string): boolean {
  return !entry.asOf || entry.asOf >= lastDayKey(month);
}

export function spendEntryFor(spend: Record<string, SpendEntry> | undefined, month: string): SpendEntry | undefined {
  const e = spend?.[month];
  return e && Number.isFinite(e.amount) && e.amount >= 0 ? e : undefined;
}

export function spendMonth(planned: number, entry: SpendEntry | undefined, month: string): SpendMonth {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = getDaysInMonth(new Date(y, m - 1, 1));
  if (!entry) {
    return { month, planned, day: 0, daysInMonth, complete: false, expectedByNow: 0 };
  }
  const complete = isCompleteEntry(entry, month);
  const asOfDay = entry.asOf?.startsWith(month) ? Number(entry.asOf.slice(8, 10)) : daysInMonth;
  const day = complete ? daysInMonth : Math.min(daysInMonth, Math.max(1, asOfDay || 1));
  const share = day / daysInMonth;
  const spent = entry.amount;
  const projected = complete ? spent : spent / share;
  const left = planned - spent;
  const daysLeft = daysInMonth - day;
  return {
    month,
    planned,
    spent,
    day,
    daysInMonth,
    complete,
    expectedByNow: planned * share,
    projected,
    variance: projected - planned,
    left,
    leftPerDay: !complete && daysLeft > 0 ? Math.max(0, left) / daysLeft : undefined,
  };
}

/**
 * Complete months before `month`, newest first, and how their average compares with the plan. The gap
 * is only reported from two months on and when it exceeds 5 % (at least 100 kr).
 */
export function spendHistory(
  spend: Record<string, SpendEntry> | undefined,
  month: string,
  planned: number,
  window = 3,
): SpendHistory {
  const months = Object.entries(spend ?? {})
    .filter(([k, e]) => KEY.test(k) && k < month && Number.isFinite(e?.amount) && e.amount >= 0 && isCompleteEntry(e, k))
    .map(([k, e]) => ({ month: k, amount: e.amount }))
    .sort((a, b) => b.month.localeCompare(a.month));
  const recent = months.slice(0, window);
  const average = recent.length > 0 ? recent.reduce((a, b) => a + b.amount, 0) / recent.length : 0;
  const diff = average - planned;
  const gap = recent.length >= 2 && Math.abs(diff) > Math.max(100, planned * 0.05) ? diff : null;
  return { months, average, basedOn: recent.length, gap };
}

/* ------------------------------------------------------------------ */
/* Summaries                                                           */
/* ------------------------------------------------------------------ */

/** Figures for one group in the month `month`, from the plan's active expenses. */
export function spendSummary(
  group: SpendGroup,
  active: ExpenseItem[],
  spend: Record<string, SpendEntry> | undefined,
  month: string,
): SpendSummary {
  const items = active.filter((e) => spendGroupOf(e) === group);
  let monthly = 0;
  let low = 0;
  let high = 0;
  let flexible = 0;
  const nudges: SpendNudge[] = [];
  for (const e of items) {
    const s = monthlySpread(e);
    monthly += s.typical;
    low += s.low;
    high += s.high;
    if (!e.committed) flexible += s.typical;
    const o = e.occurrences;
    if (o && !e.essential && o.times >= 1) {
      const each = amountSpread(e).typical;
      const saving = each * occurrencesPerMonth({ times: 1, per: o.per });
      if (saving > 0) nudges.push({ id: e.id, name: e.name, per: o.per, times: o.times, monthly: saving });
    }
  }
  nudges.sort((a, b) => b.monthly - a.monthly);
  return {
    group,
    monthly,
    low,
    high,
    weekly: monthlyToWeekly(monthly),
    daily: monthlyToDaily(monthly),
    flexible,
    itemIds: items.map((e) => e.id),
    nudges,
    month: spendMonth(monthly, spendEntryFor(spend, month), month),
    history: spendHistory(spend, month, monthly),
  };
}

export function everydaySummaries(
  active: ExpenseItem[],
  spend: Partial<Record<SpendGroup, Record<string, SpendEntry>>> | undefined,
  month: string,
): Record<SpendGroup, SpendSummary> {
  return Object.fromEntries(SPEND_GROUPS.map((g) => [g, spendSummary(g, active, spend?.[g], month)])) as Record<
    SpendGroup,
    SpendSummary
  >;
}

/**
 * The item to move when logged months keep landing away from the plan: groceries for food, else the
 * group's largest variable item entered as a total (a gap belongs in fuel, not in the price of a ticket).
 */
export function gapTarget(group: SpendGroup, expenses: ExpenseItem[]): ExpenseItem | undefined {
  const items = expenses.filter((e) => !e.includedElsewhere && spendGroupOf(e) === group);
  if (group === 'food') {
    const groceries = items.find((e) => e.subcategory === 'groceries');
    if (groceries) return groceries;
  }
  return items
    .filter((e) => !e.occurrences && !e.fixed && !e.tariff)
    .sort((a, b) => monthlySpread(b).typical - monthlySpread(a).typical)[0];
}

/**
 * The per-period amount that makes an item cost `monthly` a month in its own cadence: per week for a
 * weekly item, per purchase for one priced that way. Rounded to 10 kr.
 */
export function amountForMonthly(e: Pick<ExpenseItem, 'frequency' | 'occurrences'>, monthly: number): number {
  const n = periodsPerMonth(e);
  if (n <= 0) return 0;
  return Math.max(0, Math.round(monthly / n / 10) * 10);
}
