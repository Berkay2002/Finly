import { describe, expect, it } from 'vitest';
import { monthlySpread } from '../amounts';
import { gapTarget, spendGroupOf, spendSummary } from '../everyday';
import { isIrregular, occurrencesPerMonth } from '../frequency';
import { buildSnapshot } from '../history';
import { awaitsActual, computeMetrics } from '../metrics';
import { upcomingExpenses } from '../projections';
import { isEverydaySpend, suggestionBySlug } from '../taxonomy';
import { emptyPlan } from '../types';
import { NOW, expense, income } from './fixtures';

const fuel = (extra = {}) =>
  expense({ id: 'fuel', name: 'Fuel', category: 'transport', subcategory: 'fuel', amount: 900, fixed: false, committed: false, tags: ['car'], ...extra });
const parking = (extra = {}) =>
  expense({
    id: 'parking',
    name: 'Parking',
    category: 'transport',
    subcategory: 'car_parking',
    amount: 25,
    frequency: 'weekly',
    occurrences: { times: 3, per: 'week' },
    fixed: false,
    committed: false,
    ...extra,
  });
const nightsOut = (extra = {}) =>
  expense({
    id: 'nights',
    name: 'Nights out',
    category: 'leisure',
    subcategory: 'nights_out',
    amount: 400,
    occurrences: { times: 2, per: 'month' },
    fixed: false,
    essential: false,
    committed: false,
    ...extra,
  });
const flights = (extra = {}) =>
  expense({
    id: 'flights',
    name: 'Flights',
    category: 'transport',
    subcategory: 'flights',
    amount: 3000,
    frequency: 'yearly',
    occurrences: { times: 2, per: 'year' },
    fixed: false,
    essential: false,
    committed: false,
    ...extra,
  });

describe('priced per purchase a few times a year', () => {
  it('spreads the purchases over the months', () => {
    expect(occurrencesPerMonth({ times: 6, per: 'year' })).toBe(0.5);
    expect(monthlySpread(flights()).typical).toBe(500);
  });

  it('is not everyday spending and never lands in the calendar', () => {
    expect(isEverydaySpend(flights())).toBe(false);
    expect(isIrregular('yearly', { times: 2, per: 'year' })).toBe(false);
    const p = emptyPlan(NOW);
    p.expenses = [flights(), expense({ id: 'tax', name: 'Vehicle tax', amount: 2300, frequency: 'yearly', nextDate: '2026-10-12' })];
    expect(upcomingExpenses(p, NOW).map((u) => u.expenseId)).toEqual(['tax']);
  });

  it('starts haircuts, flights and birthdays per time, a year', () => {
    expect(suggestionBySlug('haircuts')).toMatchObject({ frequency: 'yearly', occurrences: { times: 6, per: 'year' } });
    expect(suggestionBySlug('haircuts')!.everyday).toBeUndefined();
    expect(suggestionBySlug('flights')!.occurrences?.per).toBe('year');
    expect(suggestionBySlug('birthdays')!.occurrences).toEqual({ times: 4, per: 'year' });
    expect(suggestionBySlug('congestion')).toMatchObject({ frequency: 'weekly', everyday: true });
  });
});

describe('spending groups', () => {
  it('sorts items into food, getting around, and fun and leisure', () => {
    expect(spendGroupOf(expense({ name: 'Groceries', subcategory: 'groceries', amount: 1 }))).toBe('food');
    expect(spendGroupOf(fuel())).toBe('transport');
    expect(spendGroupOf(parking())).toBe('transport');
    expect(spendGroupOf(expense({ name: 'Card', category: 'transport', subcategory: 'travel_card', amount: 1 }))).toBe('transport');
    expect(spendGroupOf(expense({ name: 'Insurance', category: 'transport', subcategory: 'car_insurance', amount: 1 }))).toBeNull();
    expect(spendGroupOf(flights())).toBeNull();
    expect(spendGroupOf(nightsOut())).toBe('leisure');
    expect(spendGroupOf(expense({ name: 'Gym', category: 'leisure', subcategory: 'gym', amount: 1 }))).toBeNull();
    // A custom item bought per time counts too.
    expect(spendGroupOf(expense({ name: 'Padel', category: 'leisure', amount: 150, occurrences: { times: 1, per: 'week' } }))).toBe('leisure');
  });

  it('sums a group per month, week and day', () => {
    const b = spendSummary('transport', [fuel()], undefined, '2026-09', 500);
    expect(b).toMatchObject({ monthly: 500, low: 500, high: 500, itemsTotal: 900, budget: 500 });
    const s = spendSummary('transport', [fuel(), parking(), flights()], undefined, '2026-09');
    const monthly = 900 + 25 * occurrencesPerMonth({ times: 3, per: 'week' });
    expect(s.monthly).toBeCloseTo(monthly, 6);
    expect(s.weekly).toBeCloseTo((monthly * 12) / 52, 6);
    expect(s.itemIds).toEqual(['fuel', 'parking']);
  });

  it('adds a gap to the largest item entered as a total, never to a price', () => {
    expect(gapTarget('transport', [parking({ amount: 500 }), fuel()])?.id).toBe('fuel');
    expect(gapTarget('leisure', [nightsOut()])).toBeUndefined();
    const groceries = expense({ id: 'g', name: 'Groceries', subcategory: 'groceries', amount: 900, frequency: 'weekly' });
    const takeaway = expense({ id: 't', name: 'Takeaway', subcategory: 'takeaway', amount: 9000, fixed: false });
    expect(gapTarget('food', [takeaway, groceries])?.id).toBe('g');
  });
});

describe('logged groups in the month metrics', () => {
  const plan = () => {
    const p = emptyPlan(NOW);
    p.income = [income({ amount: 30000 })];
    p.expenses = [fuel({ range: { low: 600, high: 1400 } }), parking(), nightsOut()];
    return p;
  };

  it('never asks for a bill for getting around', () => {
    expect(awaitsActual(fuel())).toBe(false);
    expect(computeMetrics(plan(), NOW).actuals.pending).toEqual([]);
  });

  it('runs each fully logged group on its total and leaves the others on estimates', () => {
    const p = plan();
    const base = computeMetrics(p, NOW);
    p.everydaySpend = {
      transport: { '2026-09': { amount: Math.round(base.everyday.transport.monthly) + 200 } },
      leisure: { '2026-09': { amount: 100, asOf: '2026-09-05' } },
    };
    const m = computeMetrics(p, NOW);
    expect(m.actuals.variance).toBeCloseTo(Math.round(base.everyday.transport.monthly) + 200 - base.everyday.transport.monthly, 6);
    expect(m.everyday.leisure.month.complete).toBe(false);
    expect(m.actuals.lifestyleRange.high - m.actuals.lifestyleRange.low).toBe(0);
  });

  it('keeps planned and spent per group in the snapshot', () => {
    const p = plan();
    p.everydaySpend = { leisure: { '2026-08': { amount: 950 } } };
    const snap = buildSnapshot(p, '2026-08', NOW);
    expect(snap.everydayPlanned?.leisure).toBe(800);
    expect(snap.everydaySpent).toEqual({ leisure: 950 });
    expect(snap.plan?.everydaySpend).toEqual({ leisure: { '2026-08': { amount: 950 } } });
  });
});
