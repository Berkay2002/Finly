import type { QuoteResult } from '@/engine/holdings';
import type { Holding, HoldingType } from '@/engine/types';

/**
 * Instrument search and prices behind /api/quotes (Avanza, Yahoo as backup). Both answer null when the
 * endpoint is unreachable, so callers keep what they have. An empty search result means nothing matched.
 */
export interface Instrument {
  orderbookId: string;
  name: string;
  type: HoldingType;
  currency: string;
  price?: number;
}

export async function searchInstruments(q: string, signal?: AbortSignal): Promise<Instrument[] | null> {
  const clean = q.trim();
  if (clean.length < 2) return null;
  try {
    const res = await fetch(`/api/quotes?q=${encodeURIComponent(clean)}`, { headers: { accept: 'application/json' }, signal });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return Array.isArray(body) ? (body as Instrument[]) : null;
  } catch {
    return null;
  }
}

/** A stable query for a set of holdings; also what `usePriceRefresh` watches to know when to refetch. */
export function quoteQuery(holdings: Pick<Holding, 'orderbookId' | 'isin' | 'currency'>[], to: string): string {
  const items = [...new Set(holdings.map((h) => `${h.orderbookId}:${h.isin ?? ''}:${h.currency}`))].sort();
  return items.length ? `${items.map((i) => `i=${encodeURIComponent(i)}`).join('&')}&to=${to}` : '';
}

export async function fetchQuotes(query: string): Promise<QuoteResult | null> {
  if (!query) return null;
  try {
    const res = await fetch(`/api/quotes?${query}`, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<QuoteResult>;
    return body?.quotes && body.fx ? (body as QuoteResult) : null;
  } catch {
    return null;
  }
}
