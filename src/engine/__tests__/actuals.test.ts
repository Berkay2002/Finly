import { describe, expect, it } from 'vitest';
import { actualsHistory, suggestFromActuals } from '../actuals';
import { expense } from './fixtures';

const electricity = (actuals: Record<string, number>, extra = {}) =>
  expense({
    name: 'Electricity',
    category: 'home',
    amount: 500,
    fixed: false,
    range: { low: 300, high: 900 },
    actuals,
    ...extra,
  });

describe('actualsHistory', () => {
  it('returns null without any bills', () => {
    expect(actualsHistory({})).toBeNull();
    expect(actualsHistory({ actuals: {} })).toBeNull();
  });

  it('orders entries newest first and summarises them', () => {
    const h = actualsHistory({ actuals: { '2026-07': 640, '2026-09': 410, '2026-08': 900 } })!;
    expect(h.entries.map((x) => x.month)).toEqual(['2026-09', '2026-08', '2026-07']);
    expect(h).toMatchObject({ count: 3, average: 650, min: 410, max: 900 });
  });
});

describe('suggestFromActuals', () => {
  it('waits until there are enough bills', () => {
    expect(suggestFromActuals(electricity({ '2026-08': 900, '2026-09': 950 }))).toBeNull();
  });

  it('suggests a rounded typical amount and range from the bills', () => {
    const s = suggestFromActuals(electricity({ '2026-06': 812, '2026-07': 934, '2026-08': 1048, '2026-09': 1190 }))!;
    expect(s).toMatchObject({ typical: 1000, low: 810, high: 1190, basedOn: 4, from: '2026-06', to: '2026-09' });
  });

  it('stays quiet when the estimate already matches the bills', () => {
    expect(suggestFromActuals(electricity({ '2026-07': 300, '2026-08': 300, '2026-09': 900 }))).toBeNull();
  });

  it('ignores fixed and non-monthly items', () => {
    const bills = { '2026-07': 1000, '2026-08': 1100, '2026-09': 1200 };
    expect(suggestFromActuals(electricity(bills, { fixed: true }))).toBeNull();
    expect(suggestFromActuals(electricity(bills, { frequency: 'quarterly' }))).toBeNull();
  });

  it('only looks at the most recent twelve bills', () => {
    const actuals: Record<string, number> = {};
    for (let i = 1; i <= 14; i += 1) actuals[`2025-${String(i).padStart(2, '0')}`] = i <= 2 ? 5000 : 500;
    // Months 03..14 are the recent twelve; the two 5,000 outliers fall outside the window.
    const s = suggestFromActuals(expense({ name: 'X', category: 'home', amount: 800, fixed: false, actuals }))!;
    expect(s.basedOn).toBe(12);
    expect(s.typical).toBe(500);
  });
});
