import { describe, expect, it } from 'vitest';
import { monthlySpread } from '../amounts';
import { applyCommute, cardBreakEvenDays, commuteChanges, commuteCounts, commuteMonthly, commutePrices } from '../commute';
import { occurrencesPerMonth } from '../frequency';
import type { Commute, CommutePrice, Commuter } from '../types';
import { emptyPlan } from '../types';
import { NOW, expense } from './fixtures';

const person = (extra: Partial<Commuter> = {}): Commuter => ({ id: 'p1', name: 'You', days: 5, mode: 'public', ticket: 'card', buysLunch: false, ...extra });
const prices = (p: Partial<Record<CommutePrice, number>> = {}): Record<CommutePrice, number> => ({
  lunch: 0,
  ticket: 0,
  card: 0,
  parking: 0,
  passage: 0,
  ...p,
});
let n = 0;
const makeId = () => `exp_new_${(n += 1)}`;
const week = (times: number) => occurrencesPerMonth({ times, per: 'week' });

describe('commuteCounts', () => {
  it('counts per person and adds the household up', () => {
    const c = commuteCounts({
      people: [
        person({ days: 3, buysLunch: true }),
        person({ id: 'p2', days: 2.5, ticket: 'single' }),
        person({ id: 'p3', days: 4, mode: 'car', parking: true, passages: 2, buysLunch: true }),
        person({ id: 'p4', days: 5, mode: 'active' }),
        person({ id: 'p5', days: 0, buysLunch: true }),
      ],
    });
    expect(c).toEqual({ daysIn: 14.5, lunches: 7, tickets: 5, cards: 1, parking: 4, passages: 8 });
  });

  it('caps days at seven', () => {
    expect(commuteCounts({ people: [person({ days: 12, mode: 'active', buysLunch: true })] }).lunches).toBe(7);
  });
});

describe('commute and items', () => {
  it('adds the items a new commute needs, priced per purchase', () => {
    const plan = emptyPlan(NOW);
    const commute: Commute = { people: [person({ days: 3, buysLunch: true, ticket: 'single' })] };
    const next = applyCommute(plan, commute, prices({ lunch: 120, ticket: 43 }), makeId);
    const lunches = next.expenses.find((e) => e.subcategory === 'work_lunches')!;
    const tickets = next.expenses.find((e) => e.subcategory === 'public_transport')!;
    expect(lunches).toMatchObject({ amount: 120, occurrences: { times: 3, per: 'week' }, category: 'living' });
    expect(tickets).toMatchObject({ amount: 43, occurrences: { times: 6, per: 'week' }, frequency: 'weekly' });
    expect(next.expenses.some((e) => e.subcategory === 'travel_card')).toBe(false);
    expect(next.commute).toEqual({ people: commute.people, prices: { lunch: 120, ticket: 43 } });
    expect(commuteMonthly(next.commute, commutePrices(next))).toBeCloseTo(120 * week(3) + 43 * week(6), 6);
  });

  it('turns an item entered as a total into a price per purchase that keeps its monthly cost', () => {
    const plan = emptyPlan(NOW);
    plan.expenses = [
      expense({ id: 'l', name: 'Work lunches', subcategory: 'work_lunches', amount: 2000, fixed: false, range: { low: 1500, high: 2500 } }),
    ];
    const [change] = commuteChanges(plan, { people: [person({ mode: 'active', days: 4, buysLunch: true })] }, prices());
    expect(change).toMatchObject({ kind: 'update', count: 4, price: Math.round(2000 / week(4)) });
    const next = applyCommute(plan, { people: [person({ mode: 'active', days: 4, buysLunch: true })] }, prices(), makeId);
    const l = next.expenses[0];
    expect(l.range).toBeUndefined();
    // The price is rounded to whole kronor.
    expect(Math.abs(monthlySpread(l).typical - 2000)).toBeLessThanOrEqual(week(4) / 2);
  });

  it('prices a single card as a monthly cost and several per card', () => {
    const plan = emptyPlan(NOW);
    const one = applyCommute(plan, { people: [person()] }, prices({ card: 1000 }), makeId);
    expect(one.expenses[0]).toMatchObject({ subcategory: 'travel_card', amount: 1000, frequency: 'monthly', occurrences: undefined });
    const two = applyCommute(one, { people: [person(), person({ id: 'p2', name: 'Partner' })] }, prices({ card: 1000 }), makeId);
    expect(two.expenses).toHaveLength(1);
    expect(two.expenses[0]).toMatchObject({ amount: 1000, occurrences: { times: 2, per: 'month' } });
    expect(monthlySpread(two.expenses[0]).typical).toBe(2000);
  });

  it('only removes what the previous commute added', () => {
    const plan = emptyPlan(NOW);
    // Tickets for weekend trips, before any commute.
    plan.expenses = [expense({ id: 't', name: 'Tickets', category: 'transport', subcategory: 'public_transport', amount: 43, occurrences: { times: 2, per: 'week' } })];
    const car = { people: [person({ mode: 'car', parking: true })] };
    expect(commuteChanges(plan, car, prices({ parking: 30 })).map((c) => [c.key, c.kind])).toEqual([['parking', 'add']]);

    const singles = applyCommute(plan, { people: [person({ ticket: 'single', days: 3 })] }, prices({ ticket: 43 }), makeId);
    const changes = commuteChanges(singles, car, prices({ ticket: 43, parking: 30 }));
    expect(changes.map((c) => [c.key, c.kind])).toEqual([
      ['ticket', 'remove'],
      ['parking', 'add'],
    ]);
    const kept = applyCommute(singles, car, prices({ ticket: 43, parking: 30 }), makeId, new Set(['ticket']));
    expect(kept.expenses.some((e) => e.subcategory === 'public_transport')).toBe(true);
    const removed = applyCommute(singles, car, prices({ ticket: 43, parking: 30 }), makeId);
    expect(removed.expenses.some((e) => e.subcategory === 'public_transport')).toBe(false);
  });

  it('forgets the commute when nobody is left', () => {
    const plan = applyCommute(emptyPlan(NOW), { people: [person({ mode: 'active', buysLunch: true })] }, prices({ lunch: 100 }), makeId);
    const cleared = applyCommute(plan, { people: [] }, prices({ lunch: 100 }), makeId);
    expect(cleared.commute).toBeUndefined();
    expect(cleared.expenses).toEqual([]);
  });

  it('reads prices from items priced per purchase before remembered ones', () => {
    const plan = emptyPlan(NOW);
    plan.commute = { people: [], prices: { lunch: 99, parking: 20 } };
    plan.expenses = [expense({ name: 'Work lunches', subcategory: 'work_lunches', amount: 130, occurrences: { times: 5, per: 'week' } })];
    expect(commutePrices(plan)).toMatchObject({ lunch: 130, parking: 20, ticket: 0 });
  });
});

describe('cardBreakEvenDays', () => {
  it('is the days a week at which singles cost as much as the card', () => {
    const d = cardBreakEvenDays(43, 1060)!;
    expect(43 * week(2 * d)).toBeCloseTo(1060, 6);
    expect(cardBreakEvenDays(0, 1060)).toBeNull();
  });
});
