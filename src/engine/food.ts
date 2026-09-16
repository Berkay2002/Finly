import { messages } from '@/i18n';
import { monthlySpread } from './amounts';
import { isFoodItem, type SpendSummary } from './everyday';
import type { AgeGroup, ExpenseItem, HouseholdMember } from './types';

/* ------------------------------------------------------------------ */
/* Konsumentverket's food costs                                        */
/* ------------------------------------------------------------------ */

const AGE_GROUP_IDS: AgeGroup[] = ['0', '1-3', '4-6', '7-10', '11-14', '15-17', '18-24', '25-50', '51-70', '71+'];

/** Labels are getters, so they follow the current language. */
export const AGE_GROUPS: { id: AgeGroup; readonly label: string }[] = AGE_GROUP_IDS.map((id) => ({
  id,
  get label() {
    return messages().household.food.ageGroups[id];
  },
}));

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

const AT_HOME = new Set(['groceries', 'alcohol']);

/** Restaurants, takeaway, cafés and lunches, as opposed to food bought for home. */
export function isEatingOut(e: Pick<ExpenseItem, 'subcategory'>): boolean {
  return isFoodItem(e) && !AT_HOME.has(e.subcategory);
}

/** The food group's figures, plus how much of it is eaten out. */
export interface FoodSummary extends SpendSummary {
  atHome: number;
  eatingOut: number;
  /** eatingOut / monthly. */
  eatingOutShare: number;
}

export function foodSummary(summary: SpendSummary, active: ExpenseItem[]): FoodSummary {
  const ids = new Set(summary.itemIds);
  const eatingOut = active
    .filter((e) => ids.has(e.id) && isEatingOut(e))
    .reduce((a, e) => a + monthlySpread(e).typical, 0);
  return {
    ...summary,
    atHome: summary.monthly - eatingOut,
    eatingOut,
    eatingOutShare: summary.monthly > 0 ? eatingOut / summary.monthly : 0,
  };
}
