import { getDaysInMonth } from 'date-fns';
import { amountSpread, monthlySpread } from './amounts';
import { monthlyToDaily, monthlyToWeekly, occurrencesPerMonth, periodsPerMonth } from './frequency';
import { suggestionBySlug } from './taxonomy';
import type { AgeGroup, ExpenseItem, HouseholdMember, SpendEntry } from './types';

/* ------------------------------------------------------------------ */
/* Konsumentverket's food costs                                        */
/* ------------------------------------------------------------------ */

export const AGE_GROUPS: { id: AgeGroup; label: string }[] = [
  { id: '0', label: 'Under 1' },
  { id: '1-3', label: '1–3 years' },
  { id: '4-6', label: '4–6 years' },
  { id: '7-10', label: '7–10 years' },
  { id: '11-14', label: '11–14 years' },
  { id: '15-17', label: '15–17 years' },
  { id: '18-24', label: '18–24 years' },
  { id: '25-50', label: '25–50 years' },
  { id: '51-70', label: '51–70 years' },
  { id: '71+', label: '71 or older' },
];

interface FoodCostTable {
  /** All meals cooked at home, kr per month. */
  atHome: Record<AgeGroup, number>;
  /** All meals at home except lunch on five weekdays (school lunch, or lunch bought at work). */
  lunchAway: Record<AgeGroup, number>;
}

/**
 * "Individuella matkostnader per månad" from Konsumentverket, Hushållskostnader 2026. Figures for a
 * reasonable standard cooking from their four-week menu; not statistics on what households spend.
 * The 2026 menu follows the Nordic nutrition recommendations 2023, which cut costs about 20 %
 * compared with 2025. Add a year when Konsumentverket publishes one.
 */
export const FOOD_COSTS: Record<number, FoodCostTable> = {
  2026: {
    atHome: {
      '0': 1030,
      '1-3': 1100,
      '4-6': 1710,
      '7-10': 2130,
      '11-14': 2650,
      '15-17': 3050,
      '18-24': 2840,
      '25-50': 2730,
      '51-70': 2490,
      '71+': 2450,
    },
    lunchAway: {
      '0': 710,
      '1-3': 830,
      '4-6': 1330,
      '7-10': 1650,
      '11-14': 2060,
      '15-17': 2370,
      '18-24': 2200,
      '25-50': 2120,
      '51-70': 1940,
      '71+': 1900,
    },
  },
};

/** The newest table published for `year` or earlier (the oldest one before any exists). */
export function foodCostYear(year: number): number {
  const years = Object.keys(FOOD_COSTS).map(Number).sort((a, b) => a - b);
  return [...years].reverse().find((y) => y <= year) ?? years[0];
}

export function isAdult(age: AgeGroup): boolean {
  return age === '18-24' || age === '25-50' || age === '51-70' || age === '71+';
}

export interface HouseholdFoodCost {
  /** Groceries per month for the whole household. */
  monthly: number;
  perMember: { id: string; monthly: number }[];
  /** Year of the table used. */
  year: number;
  /** Adults who buy lunch on weekdays; their lunches belong in a separate item. */
  adultsLunchingOut: number;
}

export function householdFoodCost(members: HouseholdMember[], year: number): HouseholdFoodCost {
  const y = foodCostYear(year);
  const table = FOOD_COSTS[y];
  const perMember = members.map((m) => ({
    id: m.id,
    monthly: (m.lunchAway ? table.lunchAway : table.atHome)[m.age] ?? 0,
  }));
  return {
    monthly: perMember.reduce((a, b) => a + b.monthly, 0),
    perMember,
    year: y,
    adultsLunchingOut: members.filter((m) => m.lunchAway && isAdult(m.age)).length,
  };
}

/* ------------------------------------------------------------------ */
/* Food items in the plan                                              */
/* ------------------------------------------------------------------ */

const FOOD_GROUP = 'Food & drink';
const AT_HOME = new Set(['groceries', 'alcohol']);

export function isFoodItem(e: Pick<ExpenseItem, 'subcategory'>): boolean {
  return suggestionBySlug(e.subcategory)?.group === FOOD_GROUP;
}

/** Restaurants, takeaway, cafés and lunches, as opposed to food bought for home. */
export function isEatingOut(e: Pick<ExpenseItem, 'subcategory'>): boolean {
  return isFoodItem(e) && !AT_HOME.has(e.subcategory);
}

/** One fewer purchase of an item bought several times a period, and what that frees up. */
export interface FoodNudge {
  id: string;
  name: string;
  per: 'week' | 'month';
  /** Purchases per period now. */
  times: number;
  /** Monthly saving from one fewer purchase per period. */
  monthly: number;
}

/** Where the month's food spending stands against the plan. */
export interface FoodMonth {
  month: string;
  /** Typical food per month in the plan. */
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

export interface FoodHistory {
  /** Complete months, newest first. */
  months: { month: string; amount: number }[];
  /** Average of the last `basedOn` complete months. */
  average: number;
  basedOn: number;
  /** average − planned, when there are at least two months and it is a noticeable gap; else null. */
  gap: number | null;
}

export interface FoodSummary {
  /** Typical food per month. */
  monthly: number;
  low: number;
  high: number;
  weekly: number;
  daily: number;
  atHome: number;
  eatingOut: number;
  /** eatingOut / monthly. */
  eatingOutShare: number;
  /** Food you could realistically change soon (not committed). */
  flexible: number;
  itemIds: string[];
  nudges: FoodNudge[];
  month: FoodMonth;
  history: FoodHistory;
}

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

export function foodMonth(planned: number, entry: SpendEntry | undefined, month: string): FoodMonth {
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
export function foodHistory(
  spend: Record<string, SpendEntry> | undefined,
  month: string,
  planned: number,
  window = 3,
): FoodHistory {
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

/** Food figures for the month `month` from the plan's active expenses. */
export function foodSummary(
  active: ExpenseItem[],
  spend: Record<string, SpendEntry> | undefined,
  month: string,
): FoodSummary {
  const items = active.filter(isFoodItem);
  let monthly = 0;
  let low = 0;
  let high = 0;
  let eatingOut = 0;
  let flexible = 0;
  const nudges: FoodNudge[] = [];
  for (const e of items) {
    const s = monthlySpread(e);
    monthly += s.typical;
    low += s.low;
    high += s.high;
    if (isEatingOut(e)) eatingOut += s.typical;
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
    monthly,
    low,
    high,
    weekly: monthlyToWeekly(monthly),
    daily: monthlyToDaily(monthly),
    atHome: monthly - eatingOut,
    eatingOut,
    eatingOutShare: monthly > 0 ? eatingOut / monthly : 0,
    flexible,
    itemIds: items.map((e) => e.id),
    nudges,
    month: foodMonth(monthly, spendEntryFor(spend, month), month),
    history: foodHistory(spend, month, monthly),
  };
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
