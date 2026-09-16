import { describe, expect, it } from 'vitest';
import { monthlySpread } from '../amounts';
import { amountForMonthly, isCompleteEntry, spendHistory, spendMonth, spendSummary } from '../everyday';
import { foodCostYear, foodSummary, householdFoodCost } from '../food';
import { occurrencesPerMonth, periodsPerMonth } from '../frequency';
import { freezePlan } from '../history';
import { awaitsActual, computeMetrics } from '../metrics';
import { emptyPlan } from '../types';
import { NOW, expense, income } from './fixtures';

const groceries = (extra = {}) =>
  expense({ name: 'Groceries', subcategory: 'groceries', amount: 900, frequency: 'weekly', fixed: false, committed: false, ...extra });
const lunches = (extra = {}) =>
  expense({
    name: 'Work lunches',
    subcategory: 'work_lunches',
    amount: 120,
    frequency: 'weekly',
    occurrences: { times: 4, per: 'week' },
    fixed: false,
    essential: false,
    committed: false,
    ...extra,
  });

describe('priced per purchase', () => {
  it('counts purchases per month', () => {
    expect(occurrencesPerMonth({ times: 4, per: 'week' })).toBeCloseTo((4 * 52) / 12, 6);
    expect(occurrencesPerMonth({ times: 2, per: 'month' })).toBe(2);
    expect(occurrencesPerMonth({ times: -1, per: 'week' })).toBe(0);
    expect(occurrencesPerMonth({ times: NaN, per: 'month' })).toBe(0);
  });

  it('multiplies the price of one purchase, range included', () => {
    const s = monthlySpread(lunches({ range: { low: 100, high: 150 } }));
    const n = (4 * 52) / 12;
    expect(s.typical).toBeCloseTo(120 * n, 6);
    expect(s.low).toBeCloseTo(100 * n, 6);
    expect(s.high).toBeCloseTo(150 * n, 6);
  });

  it('falls back to the frequency without occurrences', () => {
    expect(periodsPerMonth({ frequency: 'yearly' })).toBeCloseTo(1 / 12, 6);
    expect(periodsPerMonth({ frequency: 'monthly', occurrences: { times: 3, per: 'month' } })).toBe(3);
  });

  it('converts a monthly figure back into the item cadence, rounded to 10', () => {
    expect(amountForMonthly({ frequency: 'weekly' }, 4000)).toBe(920);
    expect(amountForMonthly({ frequency: 'monthly' }, 4004)).toBe(4000);
    expect(amountForMonthly({ frequency: 'monthly', occurrences: { times: 2, per: 'month' } }, 900)).toBe(450);
    expect(amountForMonthly({ frequency: 'weekly', occurrences: { times: 0, per: 'week' } }, 900)).toBe(0);
  });
});

describe('Konsumentverket household food cost', () => {
  it('matches their 2026 example: two adults, children of 5 and 9 eating school lunch → 8,440 kr', () => {
    const cost = householdFoodCost(
      [
        { id: 'a', age: '25-50', lunchAway: false },
        { id: 'b', age: '25-50', lunchAway: false },
        { id: 'c', age: '4-6', lunchAway: true },
        { id: 'd', age: '7-10', lunchAway: true },
      ],
      2026,
    );
    expect(cost.monthly).toBe(8440);
    expect(cost.adultsLunchingOut).toBe(0);
  });

  it('counts adults who buy lunch at work', () => {
    const cost = householdFoodCost([{ id: 'a', age: '25-50', lunchAway: true }], 2026);
    expect(cost.monthly).toBe(2120);
    expect(cost.adultsLunchingOut).toBe(1);
  });

  it('uses the newest table for later years and the oldest before any', () => {
    expect(foodCostYear(2030)).toBe(2026);
    expect(foodCostYear(2020)).toBe(2026);
  });
});

describe('everyday spending logged for a month', () => {
  it('treats a total without a date, or dated the last day, as the whole month', () => {
    expect(isCompleteEntry({ amount: 4000 }, '2026-09')).toBe(true);
    expect(isCompleteEntry({ amount: 4000, asOf: '2026-09-30' }, '2026-09')).toBe(true);
    expect(isCompleteEntry({ amount: 2000, asOf: '2026-09-16' }, '2026-09')).toBe(false);
  });

  it('works out the pace part-way through the month', () => {
    const fm = spendMonth(3000, { amount: 2000, asOf: '2026-09-15' }, '2026-09');
    expect(fm).toMatchObject({ day: 15, daysInMonth: 30, complete: false, expectedByNow: 1500, projected: 4000, variance: 1000, left: 1000 });
    expect(fm.leftPerDay).toBeCloseTo(1000 / 15, 6);
  });

  it('compares a whole month with the plan', () => {
    const fm = spendMonth(3000, { amount: 3400 }, '2026-08');
    expect(fm).toMatchObject({ complete: true, day: 31, projected: 3400, variance: 400, leftPerDay: undefined });
  });

  it('summarises complete months before the one viewed and flags a real gap', () => {
    const spend = {
      '2026-06': { amount: 4400 },
      '2026-07': { amount: 4600 },
      '2026-08': { amount: 4500 },
      '2026-09': { amount: 1000, asOf: '2026-09-10' },
      '2026-05': { amount: 3000, asOf: '2026-05-20' },
    };
    const h = spendHistory(spend, '2026-09', 4000);
    expect(h.months.map((x) => x.month)).toEqual(['2026-08', '2026-07', '2026-06']);
    expect(h.average).toBe(4500);
    expect(h.gap).toBe(500);
    expect(spendHistory(spend, '2026-09', 4450).gap).toBeNull();
    expect(spendHistory({ '2026-08': { amount: 9000 } }, '2026-09', 4000).gap).toBeNull();
  });
});

describe('food summary', () => {
  it('splits at home from eating out and ignores non-food items', () => {
    const items = [
      groceries(),
      lunches(),
      expense({ name: 'Restaurants', subcategory: 'restaurants', amount: 400, occurrences: { times: 2, per: 'month' }, essential: false, committed: false }),
      expense({ name: 'Rent', subcategory: 'rent', category: 'home', amount: 9000 }),
    ];
    const f = foodSummary(spendSummary('food', items, undefined, '2026-09'), items);
    const atHome = (900 * 52) / 12;
    const out = 120 * ((4 * 52) / 12) + 800;
    expect(f.atHome).toBeCloseTo(atHome, 6);
    expect(f.eatingOut).toBeCloseTo(out, 6);
    expect(f.monthly).toBeCloseTo(atHome + out, 6);
    expect(f.weekly).toBeCloseTo(((atHome + out) * 12) / 52, 6);
    expect(f.daily).toBeCloseTo(((atHome + out) * 12) / 365, 6);
    expect(f.itemIds).toHaveLength(3);
  });

  it('suggests one fewer purchase of optional items, biggest saving first', () => {
    const items = [
      groceries(),
      lunches(),
      expense({ id: 'rest', name: 'Restaurants', subcategory: 'restaurants', amount: 400, occurrences: { times: 2, per: 'month' }, essential: false, committed: false }),
    ];
    const f = foodSummary(spendSummary('food', items, undefined, '2026-09'), items);
    expect(f.nudges.map((n) => n.id)).toEqual(['exp_work_lunches', 'rest']);
    expect(f.nudges[0].monthly).toBeCloseTo((120 * 52) / 12, 6);
    expect(f.nudges[1].monthly).toBe(400);
  });
});

describe('food in the month metrics', () => {
  const plan = () => {
    const p = emptyPlan(NOW);
    p.income = [income({ amount: 30000 })];
    p.expenses = [
      groceries({ amount: 0, frequency: 'monthly', range: { low: 3000, high: 5000 } }),
      lunches(),
      expense({ id: 'el', name: 'Electricity', subcategory: 'electricity', category: 'home', amount: 600, fixed: false }),
    ];
    return p;
  };

  it('never asks for a food bill, even for a monthly groceries item', () => {
    const p = plan();
    expect(awaitsActual(p.expenses[0])).toBe(false);
    expect(awaitsActual(p.expenses[1])).toBe(false);
    expect(computeMetrics(p, NOW).actuals.pending.map((b) => b.id)).toEqual(['el']);
  });

  it('keeps the estimates while the month is only logged part-way', () => {
    const p = plan();
    p.everydaySpend = { food: { '2026-09': { amount: 5000, asOf: '2026-09-16' } } };
    const m = computeMetrics(p, NOW);
    expect(m.actuals.variance).toBe(0);
    expect(m.food.month.complete).toBe(false);
  });

  it('runs a fully logged month on the food total', () => {
    const p = plan();
    const planned = computeMetrics(p, NOW).food.monthly;
    p.everydaySpend = { food: { '2026-09': { amount: Math.round(planned) + 700 } } };
    const m = computeMetrics(p, NOW);
    expect(m.actuals.variance).toBeCloseTo(Math.round(planned) + 700 - planned, 6);
    expect(m.safeToSpend).toBeCloseTo(m.breathingRoom - m.actuals.variance, 6);
    // The food range collapses to the logged figure; electricity still swings.
    expect(m.actuals.lifestyleRange.high - m.actuals.lifestyleRange.low).toBe(0);
  });

  it('keeps only the closed month in a frozen plan', () => {
    const p = plan();
    p.everydaySpend = {
      food: { '2026-08': { amount: 4000 }, '2026-09': { amount: 100, asOf: '2026-09-02' } },
      leisure: { '2026-09': { amount: 300 } },
    };
    expect(freezePlan(p, '2026-08').everydaySpend).toEqual({ food: { '2026-08': { amount: 4000 } } });
    expect(freezePlan(p, '2026-07').everydaySpend).toBeUndefined();
  });
});
