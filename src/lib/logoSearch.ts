/**
 * Brand search behind /api/logo-search. The endpoint needs a server-side secret key, so when it is
 * not configured (or the app runs without /api, like plain `vite dev`) searches answer null and the
 * UI falls back to a name-only preview. An empty array means the search genuinely found nothing.
 */
export interface BrandResult {
  name: string;
  domain: string;
}

export function parseBrands(payload: unknown): BrandResult[] {
  const rows = Array.isArray(payload) ? payload : (payload as { results?: unknown } | null)?.results;
  if (!Array.isArray(rows)) return [];
  const out: BrandResult[] = [];
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

export async function searchBrands(q: string, signal?: AbortSignal): Promise<BrandResult[] | null> {
  const clean = q.trim();
  if (clean.length < 2) return null;
  try {
    const res = await fetch(`/api/logo-search?q=${encodeURIComponent(clean)}`, {
      headers: { accept: 'application/json' },
      signal,
    });
    if (!res.ok) return null;
    return parseBrands(await res.json());
  } catch {
    return null;
  }
}
