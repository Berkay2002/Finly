import { useSyncExternalStore } from 'react';
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
  market?: string;
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

/** How the last price refresh on this device went. Kept in memory, not in the plan, so it never counts as an edit. */
export interface QuoteStatus {
  fetchedAt?: number;
  failed: boolean;
  refreshing: boolean;
}

let status: QuoteStatus = { failed: false, refreshing: false };
const listeners = new Set<() => void>();
const setStatus = (patch: Partial<QuoteStatus>) => {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
};

export const getQuoteStatus = () => status;

export function useQuoteStatus(): QuoteStatus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getQuoteStatus,
  );
}

/** `fetchQuotes` that records the outcome. `fresh` skips the cached answer (a tap on Refresh). */
export async function refreshQuotes(query: string, fresh = false): Promise<QuoteResult | null> {
  if (!query) return null;
  setStatus({ refreshing: true });
  const result = await fetchQuotes(fresh ? `${query}&fresh=${Date.now()}` : query);
  setStatus(result ? { refreshing: false, failed: false, fetchedAt: Date.now() } : { refreshing: false, failed: true });
  return result;
}
