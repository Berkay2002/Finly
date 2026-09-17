import type { FoodGroup } from './foodProfile';

/*
 * Food prices from SCB, fetched through /api/food-prices. Konsumentverket's food table is priced once
 * a year; the KPI for food brings it to this month's prices, and grocery sales by group split it.
 */

export interface FoodPrices {
  /** `scb` when fetched through /api/food-prices; `bundled` for the copy shipped with the app. */
  source: 'scb' | 'bundled';
  /** When the data was fetched (ISO timestamp). */
  fetchedAt: string;
  /** KPI (2020 = 100) by COICOP group ("01.1" is all food) and month (YYYY-MM), about four years. */
  index: Record<string, Record<string, number>>;
  /** Grocery sales in the latest year SCB has published, MSEK by COICOP subgroup. */
  sales: { year: number; byGroup: Record<string, number> };
}

const ALL_FOOD = '01.1';

/** SCB's COICOP subgroups behind each of our food groups. Legumes have no group of their own; see `baseShares`. */
const SCB_GROUPS: Record<Exclude<FoodGroup, 'legumes'>, string[]> = {
  grains: ['01.1.1'],
  meatFish: ['01.1.2', '01.1.3'],
  dairy: ['01.1.4'],
  fats: ['01.1.5'],
  produce: ['01.1.6', '01.1.7'],
  snacks: ['01.1.8'],
  drinks: ['01.1.9', '01.2'],
};

/** Dried beans, lentils and plant protein sit inside SCB's vegetables; this much of produce is taken to be them. */
const LEGUME_SHARE_OF_PRODUCE = 0.1;

export function isFoodPrices(v: unknown): v is FoodPrices {
  const p = v as FoodPrices;
  return (
    !!p &&
    typeof p.fetchedAt === 'string' &&
    !!p.index &&
    typeof p.index === 'object' &&
    Object.values(p.index).every((s) => !!s && typeof s === 'object' && Object.values(s).every(Number.isFinite)) &&
    Object.keys(p.index[ALL_FOOD] ?? {}).length > 0 &&
    !!p.sales &&
    Number.isFinite(p.sales.year) &&
    !!p.sales.byGroup &&
    Object.values(p.sales.byGroup).every(Number.isFinite)
  );
}

const months = (series: Record<string, number>) => Object.keys(series).sort();

/** The newest month with a food index (YYYY-MM). */
export function latestMonth(prices: FoodPrices): string {
  const m = months(prices.index[ALL_FOOD]);
  return m[m.length - 1];
}

/**
 * How prices for `group` have moved from `from` (YYYY-MM) to the newest month, as a factor. A month
 * before the series starts is measured from its first month, so an old table still moves most of the way.
 */
export function priceLevel(prices: FoodPrices, from: string, group = ALL_FOOD): number {
  const series = prices.index[group];
  if (!series) return 1;
  const m = months(series);
  if (m.length === 0) return 1;
  const start = series[from] ?? series[m.find((x) => x >= from) ?? m[0]];
  const end = series[m[m.length - 1]];
  return start > 0 && end > 0 ? end / start : 1;
}

/** Average index over a calendar year, or over whatever of it the series covers. */
function yearAverage(series: Record<string, number>, year: number): number | undefined {
  const values = months(series)
    .filter((m) => m.startsWith(`${year}-`))
    .map((m) => series[m]);
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
}

/**
 * Share of a mixed-diet grocery bill by food group: what Swedish households bought in the sales year,
 * with each group repriced from that year's average to the newest month. Sums to 1.
 */
export function baseShares(prices: FoodPrices): Record<FoodGroup, number> {
  const latest = latestMonth(prices);
  const spend = {} as Record<Exclude<FoodGroup, 'legumes'>, number>;
  let total = 0;
  for (const [group, codes] of Object.entries(SCB_GROUPS) as [Exclude<FoodGroup, 'legumes'>, string[]][]) {
    let sum = 0;
    for (const code of codes) {
      const sales = prices.sales.byGroup[code] ?? 0;
      const series = prices.index[code];
      const then = series ? yearAverage(series, prices.sales.year) : undefined;
      const now = series?.[latest];
      sum += sales * (then && now ? now / then : 1);
    }
    spend[group] = sum;
    total += sum;
  }
  if (total <= 0) throw new Error('No food sales to split');
  const share = (g: Exclude<FoodGroup, 'legumes'>) => spend[g] / total;
  return {
    produce: share('produce') * (1 - LEGUME_SHARE_OF_PRODUCE),
    legumes: share('produce') * LEGUME_SHARE_OF_PRODUCE,
    meatFish: share('meatFish'),
    dairy: share('dairy'),
    grains: share('grains'),
    fats: share('fats'),
    snacks: share('snacks'),
    drinks: share('drinks'),
  };
}
