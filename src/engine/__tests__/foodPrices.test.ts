import { describe, expect, it, vi } from 'vitest';
import { buildFoodPrices, GET } from '../../../api/food-prices';
import { baseShares, isFoodPrices, latestMonth, priceLevel, type FoodPrices } from '../foodPrices';
import { BUNDLED_FOOD_PRICES } from '../foodPricesSnapshot';

const px = (rows: [string, string, string][]) =>
  '﻿' + JSON.stringify({ columns: [], data: rows.map(([g, t, v]) => ({ key: [g, t], values: [v] })) });

/** SCB answers: food index for two groups over three months, then 2024 sales for those groups. */
const fetcher = vi.fn(async (url: string | URL | Request) => {
  const u = String(url);
  const body = u.includes('KPI2020COICOPM')
    ? px([
        ['01.1', '2024M01', '120'],
        ['01.1', '2024M02', '122'],
        ['01.1', '2026M08', '123.5'],
        ['01.1.2', '2024M01', '124'],
        ['01.1.2', '2024M02', '126'],
        ['01.1.2', '2026M08', '132.5'],
        ['01.1.7', '2024M01', '122'],
        ['01.1.7', '2024M02', '122'],
        ['01.1.7', '2026M08', '..'],
      ])
    : px([
        ['01.1.2', '2024', '50110'],
        ['01.1.7', '2024', '34515'],
      ]);
  return new Response(body, { status: 200 });
}) as unknown as typeof fetch;

describe('GET /api/food-prices', () => {
  it('turns SCB rows into a monthly index by group and the latest sales year', async () => {
    const p = await buildFoodPrices(new Date('2026-09-17T00:00:00Z'), fetcher);
    expect(p.source).toBe('scb');
    expect(p.index['01.1']).toEqual({ '2024-01': 120, '2024-02': 122, '2026-08': 123.5 });
    expect(p.index['01.1.7']).toEqual({ '2024-01': 122, '2024-02': 122 });
    expect(p.sales).toEqual({ year: 2024, byGroup: { '01.1.2': 50110, '01.1.7': 34515 } });
    expect(isFoodPrices(p)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('answers 502 with a short cache when SCB is down', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 503 }));
    try {
      const res = await GET();
      expect(res.status).toBe(502);
      expect(res.headers.get('cache-control')).toContain('s-maxage=900');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('food price index', () => {
  const prices: FoodPrices = {
    source: 'bundled',
    fetchedAt: '2026-09-17T00:00:00.000Z',
    index: {
      '01.1': { '2024-01': 120, '2024-02': 122, '2025-09': 130, '2026-08': 123.5 },
      '01.1.2': { '2024-01': 124, '2024-02': 126, '2026-08': 137.5 },
      '01.1.7': { '2024-01': 120, '2024-02': 120, '2026-08': 108 },
    },
    sales: { year: 2024, byGroup: { '01.1.2': 500, '01.1.7': 500 } },
  };

  it('measures the move from a month to the newest one, from the first month when the series starts later', () => {
    expect(latestMonth(prices)).toBe('2026-08');
    expect(priceLevel(prices, '2025-09')).toBeCloseTo(123.5 / 130, 9);
    expect(priceLevel(prices, '2023-09')).toBeCloseTo(123.5 / 120, 9);
    expect(priceLevel(prices, '2025-09', '01.1.9')).toBe(1);
  });

  it('reprices the sales year: meat up and vegetables down shifts the split towards meat', () => {
    const s = baseShares(prices);
    // 500 × 137.5/125 = 550 against 500 × 108/120 = 450.
    expect(s.meatFish).toBeCloseTo(0.55, 9);
    expect(s.produce + s.legumes).toBeCloseTo(0.45, 9);
    expect(s.legumes).toBeCloseTo(0.045, 9);
    expect(Object.values(s).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });

  it('ships a usable snapshot', () => {
    expect(isFoodPrices(BUNDLED_FOOD_PRICES)).toBe(true);
    expect(latestMonth(BUNDLED_FOOD_PRICES) >= '2026-08').toBe(true);
    const s = baseShares(BUNDLED_FOOD_PRICES);
    expect(Object.values(s).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(priceLevel(BUNDLED_FOOD_PRICES, '2025-09')).toBeLessThan(1);
  });

  it('rejects malformed data', () => {
    expect(isFoodPrices(null)).toBe(false);
    expect(isFoodPrices({ ...prices, index: {} })).toBe(false);
    expect(isFoodPrices({ ...prices, sales: { year: 2024, byGroup: { x: 'no' } } })).toBe(false);
  });
});
