import { useEffect, useSyncExternalStore } from 'react';
import { isFoodPrices, latestMonth, type FoodPrices } from '@/engine/foodPrices';
import { BUNDLED_FOOD_PRICES } from '@/engine/foodPricesSnapshot';

/**
 * Food prices from /api/food-prices, fetched at most once a day per browser. Until they arrive, or
 * when they cannot be fetched, the copy bundled with the app is used, so the sheet never waits.
 * Same shape as lib/rateOutlook.ts.
 */
const STORAGE_KEY = 'finly:food-prices:v1';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

let current: FoodPrices = newer(readStored() ?? BUNDLED_FOOD_PRICES, BUNDLED_FOOD_PRICES);
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function readStored(): FoodPrices | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return isFoodPrices(v) ? v : null;
  } catch {
    return null;
  }
}

/** Whichever copy has the newer month, so an old cache never replaces newer bundled data. */
function newer(a: FoodPrices, b: FoodPrices): FoodPrices {
  return latestMonth(a) >= latestMonth(b) ? a : b;
}

function refresh(): Promise<void> {
  if (inflight) return inflight;
  const stored = readStored();
  if (stored && Date.now() - Date.parse(stored.fetchedAt) < MAX_AGE_MS) return Promise.resolve();
  inflight = fetch('/api/food-prices', { headers: { accept: 'application/json' } })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: unknown) => {
      if (!isFoodPrices(data)) return;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        // Storage blocked: the in-memory copy still serves this session.
      }
      current = newer(data, current);
      listeners.forEach((l) => l());
    })
    .catch(() => {
      // Offline, or /api is not served (plain `vite preview`): keep the bundled prices.
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useFoodPrices(): FoodPrices {
  useEffect(() => {
    void refresh();
  }, []);
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => current,
  );
}
