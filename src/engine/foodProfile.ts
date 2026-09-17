import { foodCostPricedAt, householdFoodCost, type HouseholdFoodCost } from './food';
import { baseShares, latestMonth, priceLevel, type FoodPrices } from './foodPrices';
import { BUNDLED_FOOD_PRICES } from './foodPricesSnapshot';
import type { ActivityLevel, AgeGroup, Diet, Household, HouseholdMember, Sex, ShoppingStyle, WeightGoal } from './types';

/* ------------------------------------------------------------------ */
/* Energy need                                                         */
/* ------------------------------------------------------------------ */

const KCAL_PER_MJ = 239;

/**
 * Reference energy intake, MJ per day, from Livsmedelsverket's summary of the Nordic Nutrition
 * Recommendations 2023 (tables 1 and 3). Adults are the sedentary-to-light lifestyle, PAL 1.6, which
 * Konsumentverket's 2026 menu is planned for ("i linje med medianen i befolkningen"). Children carry
 * NNR's average activity per band: 1.4 for 1–3, 1.6 for 4–10, 1.7 for 11–17. Reference adults have
 * BMI 23. Infants have no table; their cost is never scaled.
 */
const REFERENCE_MJ: Record<Exclude<AgeGroup, '0'>, { female: number; male: number; pal: number }> = {
  '1-3': { female: 4.6, male: 4.6, pal: 1.4 },
  '4-6': { female: 6.3, male: 6.3, pal: 1.6 },
  '7-10': { female: 7.8, male: 7.8, pal: 1.6 },
  '11-14': { female: 9.2, male: 10.5, pal: 1.7 },
  '15-17': { female: 10.1, male: 12.7, pal: 1.7 },
  '18-24': { female: 9.4, male: 11.8, pal: 1.6 },
  '25-50': { female: 9.0, male: 11.3, pal: 1.6 },
  '51-70': { female: 8.3, male: 10.3, pal: 1.6 },
  '71+': { female: 8.2, male: 10.1, pal: 1.6 },
};

/** Physical activity levels (NNR 2023: 1.4 sedentary, 1.6 median, 1.8 active). `average` is each band's reference PAL. */
const PAL: Record<Exclude<ActivityLevel, 'average'>, number> = { low: 1.4, high: 1.8, veryHigh: 2.1 };

const GOAL: Record<WeightGoal, number> = { lose: 0.85, maintain: 1, gain: 1.1 };

/** Midpoint of the band, for the resting-energy formula when the birth year is unknown. */
const MID_AGE: Record<AgeGroup, number> = {
  '0': 0,
  '1-3': 2,
  '4-6': 5,
  '7-10': 8,
  '11-14': 12,
  '15-17': 16,
  '18-24': 21,
  '25-50': 37,
  '51-70': 60,
  '71+': 76,
};

/** Body measurements only steer the estimate from this band; younger children follow the reference. */
export function usesBodyMetrics(age: AgeGroup): boolean {
  return age !== '0' && MID_AGE[age] >= 15;
}

export function isChild(age: AgeGroup): boolean {
  return !usesBodyMetrics(age);
}

/** Konsumentverket's figure has no sex split, so its reference person is the average of the two. */
export function referenceKcal(age: AgeGroup, sex?: Sex): number | undefined {
  if (age === '0') return undefined;
  const r = REFERENCE_MJ[age];
  const mj = sex ? r[sex] : (r.female + r.male) / 2;
  return mj * KCAL_PER_MJ;
}

/** Resting energy, kcal per day, by Mifflin–St Jeor. Matches NNR's reference adults within 2 %. */
export function restingKcal(sex: Sex, heightCm: number, weightKg: number, ageYears: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + (sex === 'male' ? 5 : -161);
}

/** How much the personalised figure may move from the table, whatever is typed. */
const RATIO_MIN = 0.6;
const RATIO_MAX = 1.8;

export interface MemberEnergy {
  /** Estimated need, kcal per day. */
  kcal: number;
  /** Konsumentverket's reference person for the band, kcal per day. */
  reference: number;
  /** kcal / reference, clamped. Scales the food cost. */
  ratio: number;
}

/** The person's energy need against the band's reference person; undefined for infants. */
export function memberEnergy(m: HouseholdMember, year: number): MemberEnergy | undefined {
  const reference = referenceKcal(m.age);
  if (reference === undefined || m.age === '0') return undefined;
  const band = REFERENCE_MJ[m.age];
  const pal = m.activity && m.activity !== 'average' ? PAL[m.activity] : band.pal;
  const goal = usesBodyMetrics(m.age) ? GOAL[m.goal ?? 'maintain'] : 1;

  let resting: number;
  if (usesBodyMetrics(m.age) && m.sex && m.heightCm && m.weightKg && m.heightCm > 0 && m.weightKg > 0) {
    const ageYears = m.birthYear ? Math.max(15, year - m.birthYear) : MID_AGE[m.age];
    resting = restingKcal(m.sex, m.heightCm, m.weightKg, ageYears);
  } else {
    // NNR's figure is REE × PAL, so the sex-specific reference gives the resting energy back.
    resting = (referenceKcal(m.age, m.sex) as number) / band.pal;
  }

  const kcal = resting * pal * goal;
  const ratio = Math.min(RATIO_MAX, Math.max(RATIO_MIN, kcal / reference));
  return { kcal, reference, ratio };
}

/* ------------------------------------------------------------------ */
/* Diet and shopping                                                   */
/* ------------------------------------------------------------------ */

/**
 * Rough price effect of a diet against Konsumentverket's mixed menu. Our own assumptions: plant-based
 * staples are cheaper than meat, while protein-heavy and low-carb diets buy more of the dear items.
 */
export const DIET_FACTOR: Record<Diet, number> = {
  omnivore: 1,
  flexitarian: 0.95,
  pescatarian: 1.03,
  vegetarian: 0.92,
  vegan: 0.9,
  highProtein: 1.15,
  lowCarb: 1.2,
};

/** Gluten- and lactose-free products cost about a tenth more over a basket. */
const FREE_FROM_FACTOR = 1.1;

export const SHOPPING_FACTOR: Record<ShoppingStyle, number> = { budget: 0.85, normal: 1, premium: 1.25 };

export function dietFactor(m: Pick<HouseholdMember, 'diet' | 'freeFrom'>): number {
  return DIET_FACTOR[m.diet ?? 'omnivore'] * (m.freeFrom ? FREE_FROM_FACTOR : 1);
}

/* ------------------------------------------------------------------ */
/* Where the money goes                                                */
/* ------------------------------------------------------------------ */

export const FOOD_GROUPS = ['produce', 'meatFish', 'dairy', 'grains', 'legumes', 'fats', 'snacks', 'drinks'] as const;
export type FoodGroup = (typeof FOOD_GROUPS)[number];

/**
 * How a diet reshapes the mixed-diet split from `baseShares` (SCB's sales, repriced to this month):
 * multipliers per food group, renormalised afterwards. Our own judgement of what each diet swaps.
 */
export const DIET_TILT: Record<Diet, Partial<Record<FoodGroup, number>>> = {
  omnivore: {},
  flexitarian: { meatFish: 0.6, legumes: 3, produce: 1.2 },
  pescatarian: { meatFish: 0.65, legumes: 3, produce: 1.2 },
  vegetarian: { meatFish: 0, legumes: 5, dairy: 1.35, produce: 1.4, grains: 1.2 },
  vegan: { meatFish: 0, dairy: 0, legumes: 8, produce: 1.7, grains: 1.35, fats: 1.6 },
  highProtein: { meatFish: 1.5, dairy: 1.25, grains: 0.7, snacks: 0.55 },
  lowCarb: { meatFish: 1.55, dairy: 1.25, produce: 1.3, grains: 0.25, fats: 2.5, snacks: 0.4 },
};

/** Share of the groceries bill by food group for a diet. Sums to 1. */
export function groupShares(diet: Diet, base: Record<FoodGroup, number>): Record<FoodGroup, number> {
  const tilt = DIET_TILT[diet];
  const raw = FOOD_GROUPS.map((g) => base[g] * (tilt[g] ?? 1));
  const total = raw.reduce((a, b) => a + b, 0);
  return Object.fromEntries(FOOD_GROUPS.map((g, i) => [g, total > 0 ? raw[i] / total : 0])) as Record<FoodGroup, number>;
}

/* ------------------------------------------------------------------ */
/* The estimate                                                        */
/* ------------------------------------------------------------------ */

export interface PersonalMemberCost {
  id: string;
  /** Konsumentverket's figure for the band. */
  base: number;
  energy?: MemberEnergy;
  dietFactor: number;
  monthly: number;
}

export interface PersonalFoodCost extends Omit<HouseholdFoodCost, 'perMember'> {
  /** Konsumentverket's published figure for the whole household, before repricing and personalising. */
  base: number;
  /** Month (YYYY-MM) whose prices `monthly` is at, and how far food prices moved there from the table's month. */
  priceMonth: string;
  priceLevel: number;
  perMember: PersonalMemberCost[];
  shoppingFactor: number;
  /** The month's groceries by food group, largest first. Sums to `monthly`. */
  breakdown: { group: FoodGroup; monthly: number }[];
}

/**
 * Groceries for the household: Konsumentverket's figure per person, brought to this month's prices
 * with SCB's food index, then scaled by each person's energy need, diet and the household's shopping
 * style when `household.personalised` is on. Without `prices` the figure stays at the table's own
 * prices; personalising off makes every other factor 1.
 */
export function personalFoodCost(household: Household, year: number, prices?: FoodPrices): PersonalFoodCost {
  const on = household.personalised === true;
  const base = householdFoodCost(household.members, year);
  const level = prices ? priceLevel(prices, foodCostPricedAt(year)) : 1;
  const shoppingFactor = on ? SHOPPING_FACTOR[household.shopping ?? 'normal'] : 1;
  const perMember = household.members.map((m, i) => {
    const b = base.perMember[i].monthly;
    const energy = on ? memberEnergy(m, year) : undefined;
    const diet = on ? dietFactor(m) : 1;
    return { id: m.id, base: b, energy, dietFactor: diet, monthly: b * level * (energy?.ratio ?? 1) * diet * shoppingFactor };
  });
  const monthly = perMember.reduce((a, b) => a + b.monthly, 0);

  const shares = baseShares(prices ?? BUNDLED_FOOD_PRICES);
  const byGroup = Object.fromEntries(FOOD_GROUPS.map((g) => [g, 0])) as Record<FoodGroup, number>;
  household.members.forEach((m, i) => {
    const s = groupShares(on ? (m.diet ?? 'omnivore') : 'omnivore', shares);
    for (const g of FOOD_GROUPS) byGroup[g] += perMember[i].monthly * s[g];
  });
  const breakdown = FOOD_GROUPS.map((group) => ({ group, monthly: byGroup[group] }))
    .filter((x) => x.monthly > 0)
    .sort((a, b) => b.monthly - a.monthly);

  return {
    base: base.monthly,
    priceMonth: prices ? latestMonth(prices) : foodCostPricedAt(year),
    priceLevel: level,
    monthly,
    perMember,
    year: base.year,
    adultsLunchingOut: base.adultsLunchingOut,
    shoppingFactor,
    breakdown,
  };
}
