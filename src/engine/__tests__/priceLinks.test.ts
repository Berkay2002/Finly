import { describe, expect, it } from 'vitest';
import type { FoodPrices } from '../foodPrices';
import {
  followFoodPrices,
  followSpot,
  foodLinksToRefresh,
  foodPriceLink,
  reconcilePriceLink,
  refreshPriceLinks,
  spotAreasToRefresh,
} from '../priceLinks';
import type { ExpenseItem } from '../types';

const prices = (months: Record<string, number>): FoodPrices => ({
  source: 'bundled',
  fetchedAt: '2026-09-17T00:00:00.000Z',
  index: { '01.1': months },
  sales: { year: 2024, byGroup: { '01.1.2': 1 } },
});

const item = (over: Partial<ExpenseItem> = {}): ExpenseItem => ({
  id: 'groc',
  name: 'Groceries',
  category: 'living',
  subcategory: 'groceries',
  amount: 5000,
  frequency: 'monthly',
  fixed: false,
  range: { low: 4500, high: 5500 },
  essential: true,
  committed: false,
  tags: [],
  ...over,
});

const supply = (over: Partial<ExpenseItem['tariff']> = {}): ExpenseItem =>
  item({
    id: 'el',
    subcategory: 'electricity',
    range: undefined,
    tariff: { part: 'supply', kwh: 300, energyPrice: 80, surcharge: 8, monthlyFee: 39, priceArea: 'SE3', priceMonth: '2026-07', followSpot: true, ...over },
  });

describe('food price link', () => {
  const linked = item({ priceLink: foodPriceLink({ amount: 5000, range: { low: 4500, high: 5500 } }, '2026-06') });

  it('scales the base amount and range by the index move since the base month, once per new month', () => {
    const p = prices({ '2026-06': 120, '2026-07': 123, '2026-08': 126 });
    const next = followFoodPrices(linked, p);
    expect(next.amount).toBe(5250);
    expect(next.range).toEqual({ low: 4725, high: 5775 });
    expect(next.priceLink).toMatchObject({ base: { amount: 5000 }, baseMonth: '2026-06', month: '2026-08' });
    // Same data again: nothing to do, same object back.
    expect(followFoodPrices(next, p)).toBe(next);
    expect(foodLinksToRefresh([next], p)).toBe(false);
    expect(foodLinksToRefresh([linked], p)).toBe(true);
  });

  it('recomputes from the base rather than compounding when the index moves back', () => {
    const up = followFoodPrices(linked, prices({ '2026-06': 120, '2026-07': 132 }));
    expect(up.amount).toBe(5500);
    const back = followFoodPrices(up, prices({ '2026-06': 120, '2026-07': 132, '2026-08': 120 }));
    expect(back.amount).toBe(5000);
  });

  it('leaves unlinked items alone', () => {
    const plain = item();
    expect(followFoodPrices(plain, prices({ '2026-08': 130 }))).toBe(plain);
  });

  it('makes a hand-typed amount the new base at the month the item reflects', () => {
    const p = prices({ '2026-06': 120, '2026-08': 126 });
    const moved = followFoodPrices(linked, p);
    const edited = reconcilePriceLink(moved, { ...moved, amount: 6000 });
    expect(edited.priceLink).toMatchObject({ base: { amount: 6000 }, baseMonth: '2026-08', month: '2026-08' });
    // A refresh with the same data then changes nothing.
    expect(followFoodPrices(edited, p)).toBe(edited);
    // An unrelated edit keeps the link as it is.
    const renamed = reconcilePriceLink(moved, { ...moved, name: 'Food' });
    expect(renamed.priceLink).toBe(moved.priceLink);
  });

  it('drops the link when a tariff takes over the amount', () => {
    const t = reconcilePriceLink(linked, { ...linked, tariff: supply().tariff });
    expect(t.priceLink).toBeUndefined();
  });
});

describe('spot price link', () => {
  it('puts a newer month into a following supply tariff and recalculates the bill', () => {
    const el = supply();
    const next = followSpot(el, [{ area: 'SE3', month: '2026-08', oreInclVat: 95.5 }]);
    expect(next.tariff).toMatchObject({ energyPrice: 95.5, priceMonth: '2026-08', followSpot: true });
    expect(next.amount).toBe(Math.round(300 * (95.5 + 8) / 100 + 39));
    expect(followSpot(next, [{ area: 'SE3', month: '2026-08', oreInclVat: 95.5 }])).toBe(next);
  });

  it('ignores other areas, older months, grid tariffs and tariffs that do not follow', () => {
    const el = supply();
    expect(followSpot(el, [{ area: 'SE4', month: '2026-08', oreInclVat: 95.5 }])).toBe(el);
    expect(followSpot(el, [{ area: 'SE3', month: '2026-07', oreInclVat: 95.5 }])).toBe(el);
    const grid = supply({ part: 'grid' });
    expect(followSpot(grid, [{ area: 'SE3', month: '2026-08', oreInclVat: 95.5 }])).toBe(grid);
    const manual = supply({ followSpot: false });
    expect(followSpot(manual, [{ area: 'SE3', month: '2026-08', oreInclVat: 95.5 }])).toBe(manual);
  });

  it('lists only the areas that still lack the month', () => {
    expect(spotAreasToRefresh([supply(), supply({ priceArea: 'SE1', priceMonth: '2026-08' }), supply({ followSpot: false, priceArea: 'SE2' })], '2026-08')).toEqual(['SE3']);
  });
});

describe('refreshPriceLinks', () => {
  it('applies both inputs and reports which items moved', () => {
    const groceries = item({ priceLink: foodPriceLink({ amount: 5000 }, '2026-06') });
    const el = supply();
    const rent = item({ id: 'rent', subcategory: 'rent', fixed: true });
    const { expenses, changed } = refreshPriceLinks([groceries, el, rent], {
      food: prices({ '2026-06': 100, '2026-08': 102 }),
      spot: [{ area: 'SE3', month: '2026-08', oreInclVat: 90 }],
    });
    expect(changed).toEqual(['groc', 'el']);
    expect(expenses[0].amount).toBe(5100);
    expect(expenses[1].tariff?.energyPrice).toBe(90);
    expect(expenses[2]).toBe(rent);
  });
});
