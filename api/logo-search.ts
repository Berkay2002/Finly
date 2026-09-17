/**
 * GET /api/logo-search?q=: brand search for the company logo picker. Logo.dev's Search API works on
 * every plan but only with a secret key, which must never ship in client code — so the browser calls
 * this proxy and the key stays server-side.
 *
 * Answers with a trimmed array of { name, domain }; logos themselves are rendered by the client from
 * the publishable key. Without LOGO_DEV_SECRET_KEY the endpoint answers 503 and the app falls back to
 * name-only logo lookups. Edge-cached: brand matches barely change, but failures are cached briefly so
 * an outage does not turn every keystroke into an upstream call.
 *
 * Kept free of imports so Vercel can run it as-is; tested in src/lib/__tests__/logoSearch.test.ts.
 */

const SEARCH = 'https://api.logo.dev/search';

/** Fresh for a day at the edge, then served stale for up to a week while one request refreshes it. */
const CACHE_OK = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';
const CACHE_FAIL = 'public, max-age=300, s-maxage=900';

/** The first matches for a name, deduplicated by domain. Tolerates an envelope object or a bare array. */
export function parseBrands(payload: unknown): { name: string; domain: string }[] {
  const rows = Array.isArray(payload) ? payload : (payload as { results?: unknown } | null)?.results;
  if (!Array.isArray(rows)) return [];
  const out: { name: string; domain: string }[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const r = row as { name?: unknown; domain?: unknown };
    if (typeof r?.domain !== 'string' || !r.domain) continue;
    if (seen.has(r.domain)) continue;
    seen.add(r.domain);
    out.push({ name: typeof r.name === 'string' && r.name ? r.name : r.domain, domain: r.domain });
    if (out.length >= 8) break;
  }
  return out;
}

export async function GET(request: Request, overrides?: { key?: string }): Promise<Response> {
  // The vite dev shim passes the key explicitly: Vite loads .env files into import.meta.env,
  // not into process.env the way a real serverless runtime does.
  const key = overrides?.key ?? process.env.LOGO_DEV_SECRET_KEY;
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
  if (!key) {
    return Response.json({ error: 'Logo search is not configured' }, { status: 503, headers: { 'cache-control': CACHE_FAIL } });
  }
  if (q.length < 2) {
    return Response.json({ error: 'Missing q' }, { status: 400, headers: { 'cache-control': CACHE_FAIL } });
  }
  try {
    // `match` ranks exact name matches ahead of typeahead suggestions: the person typed a company, not a prefix.
    const res = await fetch(`${SEARCH}?q=${encodeURIComponent(q)}&strategy=match`, {
      headers: { accept: 'application/json', authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`api.logo.dev answered ${res.status}`);
    return Response.json(parseBrands(await res.json()), { headers: { 'cache-control': CACHE_OK } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Upstream error' },
      { status: 502, headers: { 'cache-control': CACHE_FAIL } },
    );
  }
}
