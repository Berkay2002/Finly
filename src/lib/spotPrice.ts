import { VAT_RATE } from '@/engine/electricity';
import { messages } from '@/i18n';
import type { PriceArea } from '@/engine/types';

/**
 * Nord Pool day-ahead prices from elprisetjustnu.se: free, no key, CORS open, one JSON file per day
 * and price area. Prices are SEK/kWh excluding moms, one entry per 15 minutes (hourly before
 * October 2025).
 */
const API = 'https://www.elprisetjustnu.se/api/v1/prices';

interface PricePoint {
  SEK_per_kWh: number;
}

export interface SpotAverage {
  area: PriceArea;
  /** YYYY-MM. */
  month: string;
  /** Average spot price in öre/kWh including moms, rounded to one decimal. */
  oreInclVat: number;
  /** Days that had data; a month still in progress has fewer than it will end with. */
  days: number;
}

/**
 * Requests are kept to a minimum: nothing is fetched until the user asks, a month's result is shared
 * by concurrent callers, and a finished month (whose prices can no longer change) is kept in
 * localStorage so it is only ever downloaded once per browser. Downloads run a few days at a time
 * rather than a whole month at once.
 */
const memory = new Map<string, Promise<SpotAverage>>();
const STORAGE_PREFIX = 'finly:spot:';
const CONCURRENCY = 4;

function readStored(key: string): SpotAverage | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const v = JSON.parse(raw) as SpotAverage;
    return Number.isFinite(v?.oreInclVat) ? v : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, v: SpotAverage) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(v));
  } catch {
    // Storage full or blocked: the in-memory copy still serves this session.
  }
}

const isComplete = (month: string, now: Date) => month < monthKey(now);

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** YYYY-MM of the last complete month before `now`. */
export function previousMonthKey(now: Date = new Date()): string {
  return monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

/** Plain average of every price interval in the month, the same figure "rörligt pris" is billed on before påslag. */
export function fetchSpotAverage(area: PriceArea, month: string): Promise<SpotAverage> {
  const key = `${area}:${month}`;
  let pending = memory.get(key);
  if (pending) return pending;

  const stored = readStored(key);
  if (stored) {
    pending = Promise.resolve(stored);
  } else {
    pending = load(area, month).then((v) => {
      if (isComplete(month, new Date())) writeStored(key, v);
      return v;
    });
    pending.catch(() => memory.delete(key));
  }
  memory.set(key, pending);
  return pending;
}

/** Runs `fn` over `items` with at most `limit` calls in flight, keeping the input order. */
async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function load(area: PriceArea, month: string): Promise<SpotAverage> {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const today = new Date();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1).filter((d) => new Date(y, m - 1, d) <= today);

  const results = await mapLimited(days, CONCURRENCY, async (d) => {
    const url = `${API}/${y}/${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}_${area}.json`;
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(messages().household.spot.unavailable(res.status));
    return (await res.json()) as PricePoint[];
  });

  const prices = results.flatMap((day) => day ?? []).map((p) => p.SEK_per_kWh).filter(Number.isFinite);
  if (prices.length === 0) throw new Error(messages().household.spot.noPrices);
  const avgSek = prices.reduce((a, b) => a + b, 0) / prices.length;
  return {
    area,
    month,
    oreInclVat: Math.round(avgSek * 100 * (1 + VAT_RATE) * 10) / 10,
    days: results.filter(Boolean).length,
  };
}
