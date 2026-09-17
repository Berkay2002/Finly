/**
 * GET /api/food-prices: SCB's consumer price index for food by COICOP group and month, and grocery
 * sales by group for the latest year SCB has published. Together they bring Konsumentverket's yearly
 * food table to this month's prices and split it by food group (src/engine/foodPrices.ts);
 * Konsumentverket itself says price changes during the year are for the reader to allow for.
 *
 * SCB's PxWeb API is open and sends CORS headers, but allows 30 calls per 10 s per IP and its answer
 * changes once a month, so Vercel's CDN caches it for a day. Two upstream calls per invocation. On
 * failure the app falls back to the copy it ships with (regenerate with `npm run food:prices`).
 *
 * Kept free of imports so Vercel can run it as-is; the unit test lives in src/engine/__tests__.
 */

const KPI = 'https://api.scb.se/OV0104/v1/doris/sv/ssd/START/PR/PR0101/PR0101A/KPI2020COICOPM';
const SALES = 'https://api.scb.se/OV0104/v1/doris/sv/ssd/START/HA/HA0103/HA0103A/LivsNN';

/** Food (01.1) with its nine subgroups, and non-alcoholic drinks (01.2). Alcohol is not groceries. */
const GROUPS = ['01.1', '01.1.1', '01.1.2', '01.1.3', '01.1.4', '01.1.5', '01.1.6', '01.1.7', '01.1.8', '01.1.9', '01.2'];
/** Four years of index, so the average of the sales year (published a year or two late) is always inside. */
const MONTHS = 48;

/** Fresh for a day at the edge, then served stale for up to a month while one request refreshes it. */
const CACHE_OK = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=2592000';
const CACHE_FAIL = 'public, max-age=300, s-maxage=900';

interface PxResponse {
  data: { key: string[]; values: string[] }[];
}

async function px(url: string, query: unknown, fetcher: typeof fetch): Promise<PxResponse> {
  const res = await fetcher(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query, response: { format: 'json' } }),
  });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  // PxWeb prefixes its JSON with a byte-order mark.
  return JSON.parse((await res.text()).replace(/^﻿/, '')) as PxResponse;
}

/** "2026M08" → "2026-08". */
const month = (px: string) => px.replace('M', '-');

export async function buildFoodPrices(now: Date = new Date(), fetcher: typeof fetch = fetch) {
  const [kpi, sales] = await Promise.all([
    px(
      KPI,
      [
        { code: 'VaruTjanstegrupp', selection: { filter: 'item', values: GROUPS } },
        { code: 'ContentsCode', selection: { filter: 'item', values: ['0000080H'] } },
        { code: 'Tid', selection: { filter: 'top', values: [String(MONTHS)] } },
      ],
      fetcher,
    ),
    px(
      SALES,
      [
        { code: 'Varugrupp', selection: { filter: 'item', values: GROUPS.filter((g) => g !== '01.1') } },
        { code: 'ContentsCode', selection: { filter: 'item', values: ['000008B9'] } },
        { code: 'Tid', selection: { filter: 'top', values: ['1'] } },
      ],
      fetcher,
    ),
  ]);

  const index: Record<string, Record<string, number>> = {};
  for (const row of kpi.data) {
    const value = Number(row.values[0]);
    if (!Number.isFinite(value)) continue;
    (index[row.key[0]] ??= {})[month(row.key[1])] = value;
  }
  if (!index['01.1'] || Object.keys(index['01.1']).length === 0) throw new Error('No food price index');

  const byGroup: Record<string, number> = {};
  let year = 0;
  for (const row of sales.data) {
    const value = Number(row.values[0]);
    if (!Number.isFinite(value)) continue;
    byGroup[row.key[0]] = value;
    year = Number(row.key[1]);
  }
  if (!year || Object.keys(byGroup).length === 0) throw new Error('No food sales');

  return { source: 'scb' as const, fetchedAt: now.toISOString(), index, sales: { year, byGroup } };
}

export async function GET(): Promise<Response> {
  try {
    const prices = await buildFoodPrices();
    return Response.json(prices, { headers: { 'cache-control': CACHE_OK } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Upstream error' },
      { status: 502, headers: { 'cache-control': CACHE_FAIL } },
    );
  }
}
