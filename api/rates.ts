/**
 * GET /api/rates: the Riksbank policy rate, its monthly history and the latest forecast path, in the
 * shape of `RateOutlook` (src/engine/rates.ts).
 *
 * The Riksbank APIs send no CORS headers, so the browser cannot call them directly. This function does,
 * and Vercel's CDN caches the answer for a day: the Riksbank only changes the data at policy meetings,
 * its anonymous API allows only a few calls a minute, and the Hobby plan counts invocations. Each
 * invocation makes two upstream calls. On failure the app falls back to the copy it ships with.
 *
 * Kept free of imports so Vercel can run it as-is; the unit test lives in src/engine/__tests__.
 */

const SWEA = 'https://api.riksbank.se/swea/v1/Observations/SECBREPOEFF';
const FORECASTS = 'https://api.riksbank.se/monetary_policy_data/v1/forecasts?series=SEQRATENAYNA';

/** Fresh for a day at the edge, then served stale for up to a week while one request refreshes it. */
const CACHE_OK = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';
/** Failures are cached briefly so a Riksbank outage does not turn every visit into two upstream calls. */
const CACHE_FAIL = 'public, max-age=300, s-maxage=900';

interface Observation {
  date: string;
  value: number | null;
}

interface Vintage {
  metadata: { policy_round: string; policy_round_end_dtm: string };
  observations: { dt: string; value: number | null }[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function getJson<T>(url: string, fetcher: typeof fetch): Promise<T> {
  const res = await fetcher(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return (await res.json()) as T;
}

export async function buildOutlook(now: Date = new Date(), fetcher: typeof fetch = fetch) {
  // November four years back covers CSN's three-year window for the last decided year.
  const from = `${now.getUTCFullYear() - 4}-11-01`;
  const [observations, forecasts] = await Promise.all([
    getJson<Observation[]>(`${SWEA}/${from}/${iso(now)}`, fetcher),
    getJson<{ data: { vintages: Vintage[] }[] }>(FORECASTS, fetcher),
  ]);

  const valid = observations.filter((o): o is { date: string; value: number } => typeof o.value === 'number');
  const latest = valid[valid.length - 1];
  if (!latest) throw new Error('No policy rate observations');

  const byMonth = new Map<string, number[]>();
  for (const o of valid) {
    const key = o.date.slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), o.value]);
  }
  const policyHistory = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, values]) => ({ month, value: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 1000) / 1000 }));

  const vintages = forecasts.data?.[0]?.vintages ?? [];
  const vintage = vintages.reduce<Vintage | undefined>(
    (best, v) => (!best || v.metadata.policy_round_end_dtm > best.metadata.policy_round_end_dtm ? v : best),
    undefined,
  );
  if (!vintage) throw new Error('No policy rate forecast');
  const pathFrom = `${now.getUTCFullYear() - 1}-01-01`;
  const path = vintage.observations
    .filter((o): o is { dt: string; value: number } => typeof o.value === 'number' && o.dt >= pathFrom)
    .map((o) => ({ date: o.dt, value: o.value }));

  return {
    source: 'riksbank' as const,
    fetchedAt: now.toISOString(),
    policyRate: { date: latest.date, value: latest.value },
    policyHistory,
    forecast: {
      round: vintage.metadata.policy_round,
      published: vintage.metadata.policy_round_end_dtm.slice(0, 10),
      path,
    },
  };
}

export async function GET(): Promise<Response> {
  try {
    const outlook = await buildOutlook();
    return Response.json(outlook, { headers: { 'cache-control': CACHE_OK } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Upstream error' },
      { status: 502, headers: { 'cache-control': CACHE_FAIL } },
    );
  }
}
