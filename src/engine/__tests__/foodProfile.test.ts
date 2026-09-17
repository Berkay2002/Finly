import { describe, expect, it } from 'vitest';
import { householdFoodCost } from '../food';
import { baseShares } from '../foodPrices';
import { BUNDLED_FOOD_PRICES } from '../foodPricesSnapshot';
import { DIET_TILT, FOOD_GROUPS, groupShares, memberEnergy, personalFoodCost, referenceKcal, restingKcal } from '../foodProfile';
import type { Diet, HouseholdMember } from '../types';

const YEAR = 2026;
const adult = (extra: Partial<HouseholdMember> = {}): HouseholdMember => ({ id: 'a', age: '25-50', lunchAway: false, ...extra });

describe('energy need against the reference person', () => {
  it('is 1 for the reference person: sex unknown, average activity, no body metrics', () => {
    expect(memberEnergy(adult(), YEAR)?.ratio).toBe(1);
    expect(memberEnergy({ id: 'c', age: '7-10', lunchAway: true }, YEAR)?.ratio).toBe(1);
  });

  it('has no figure for infants', () => {
    expect(memberEnergy({ id: 'b', age: '0', lunchAway: false }, YEAR)).toBeUndefined();
    expect(referenceKcal('0')).toBeUndefined();
  });

  it('puts men above and women below the sex-averaged table figure', () => {
    const man = memberEnergy(adult({ sex: 'male' }), YEAR)!;
    const woman = memberEnergy(adult({ sex: 'female' }), YEAR)!;
    expect(man.ratio).toBeCloseTo(11.3 / 10.15, 3);
    expect(woman.ratio).toBeCloseTo(9.0 / 10.15, 3);
    expect(man.kcal).toBeCloseTo(11.3 * 239, 0);
  });

  it('matches NNR resting energy for their reference adults within 2 %', () => {
    // NNR 25–50: man 74.8 kg at BMI 23 → 7.1 MJ; woman 64.1 kg → 5.7 MJ.
    expect(restingKcal('male', 180.3, 74.8, 37) / (7.1 * 239)).toBeCloseTo(1, 1);
    expect(restingKcal('female', 166.9, 64.1, 37) / (5.7 * 239)).toBeCloseTo(1, 1);
  });

  it('scales a big, very active man up and a small, sedentary woman down, within the clamp', () => {
    const big = memberEnergy(adult({ sex: 'male', heightCm: 190, weightKg: 95, activity: 'veryHigh', birthYear: 1998 }), YEAR)!;
    const small = memberEnergy(adult({ sex: 'female', heightCm: 158, weightKg: 52, activity: 'low', goal: 'lose' }), YEAR)!;
    expect(big.ratio).toBeGreaterThan(1.3);
    expect(big.ratio).toBeLessThanOrEqual(1.8);
    expect(small.ratio).toBeLessThan(0.75);
    expect(small.ratio).toBeGreaterThanOrEqual(0.6);
    expect(memberEnergy(adult({ sex: 'male', heightCm: 250, weightKg: 250, activity: 'veryHigh' }), YEAR)!.ratio).toBe(1.8);
  });

  it('ignores body metrics and goals for children but keeps activity', () => {
    const child = { id: 'c', age: '7-10' as const, lunchAway: true };
    expect(memberEnergy({ ...child, heightCm: 190, weightKg: 95, goal: 'gain' }, YEAR)!.ratio).toBe(1);
    expect(memberEnergy({ ...child, activity: 'high' }, YEAR)!.ratio).toBeCloseTo(1.8 / 1.6, 6);
  });
});

describe('personalised household groceries', () => {
  const family: HouseholdMember[] = [
    { id: 'a', age: '25-50', lunchAway: false, sex: 'male', heightCm: 185, weightKg: 90, diet: 'highProtein' },
    { id: 'b', age: '25-50', lunchAway: false, sex: 'female', diet: 'vegan' },
    { id: 'c', age: '4-6', lunchAway: true },
    { id: 'd', age: '7-10', lunchAway: true },
  ];

  it('equals Konsumentverket while personalising is off, whatever detail is stored', () => {
    const cost = personalFoodCost({ members: family, shopping: 'premium' }, YEAR);
    expect(cost.monthly).toBe(8440);
    expect(cost.base).toBe(8440);
    expect(cost.perMember.every((m) => m.dietFactor === 1 && m.energy === undefined)).toBe(true);
    expect(cost.shoppingFactor).toBe(1);
    expect(cost.monthly).toBe(householdFoodCost(family, YEAR).monthly);
  });

  it('multiplies energy, diet and shopping factors per person', () => {
    const cost = personalFoodCost({ members: family, personalised: true, shopping: 'budget' }, YEAR);
    const a = cost.perMember[0];
    expect(a.base).toBe(2730);
    expect(a.monthly).toBeCloseTo(2730 * a.energy!.ratio * 1.15 * 0.85, 6);
    const b = cost.perMember[1];
    expect(b.monthly).toBeCloseTo(2730 * (9.0 / 10.15) * 0.9 * 0.85, 3);
    expect(cost.perMember[2].monthly).toBeCloseTo(1330 * 0.85, 6);
    expect(cost.monthly).toBeCloseTo(cost.perMember.reduce((s, m) => s + m.monthly, 0), 6);
    expect(cost.base).toBe(8440);
  });

  it('charges a tenth more for free-from products', () => {
    const cost = personalFoodCost({ members: [adult({ freeFrom: true })], personalised: true }, YEAR);
    expect(cost.monthly).toBeCloseTo(2730 * 1.1, 6);
  });

  it('splits the bill by food group, summing to the total, with no meat for a vegetarian', () => {
    const veg = personalFoodCost({ members: [adult({ diet: 'vegetarian' })], personalised: true }, YEAR);
    expect(veg.breakdown.reduce((s, g) => s + g.monthly, 0)).toBeCloseTo(veg.monthly, 6);
    expect(veg.breakdown.find((g) => g.group === 'meatFish')).toBeUndefined();
    expect(veg.breakdown[0].monthly).toBeGreaterThanOrEqual(veg.breakdown[1].monthly);

    const plain = personalFoodCost({ members: [adult()] }, YEAR);
    const meat = baseShares(BUNDLED_FOOD_PRICES).meatFish;
    expect(meat).toBeGreaterThan(0.15);
    expect(plain.breakdown.find((g) => g.group === 'meatFish')?.monthly).toBeCloseTo(2730 * meat, 6);
  });

  it('has group shares that sum to 1 for every diet', () => {
    const base = baseShares(BUNDLED_FOOD_PRICES);
    for (const diet of Object.keys(DIET_TILT) as Diet[]) {
      const s = groupShares(diet, base);
      expect(FOOD_GROUPS.reduce((sum, g) => sum + s[g], 0)).toBeCloseTo(1, 9);
    }
    expect(groupShares('vegan', base).dairy).toBe(0);
    expect(groupShares('highProtein', base).meatFish).toBeGreaterThan(base.meatFish);
  });

  it('brings the table to the newest month with the food index, before any personalising', () => {
    const prices = {
      source: 'scb' as const,
      fetchedAt: '2026-09-17T00:00:00.000Z',
      index: { '01.1': { '2025-09': 130, '2026-08': 123.5 }, '01.1.2': { '2025-09': 132, '2026-08': 132 } },
      sales: { year: 2024, byGroup: { '01.1.2': 100 } },
    };
    const cost = personalFoodCost({ members: [adult()] }, YEAR, prices);
    expect(cost.priceLevel).toBeCloseTo(123.5 / 130, 9);
    expect(cost.priceMonth).toBe('2026-08');
    expect(cost.base).toBe(2730);
    expect(cost.monthly).toBeCloseTo(2730 * (123.5 / 130), 6);
    expect(personalFoodCost({ members: [adult()] }, YEAR).priceMonth).toBe('2025-09');
  });
});
