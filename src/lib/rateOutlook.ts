import { useEffect, useSyncExternalStore } from 'react';
import { BUNDLED_OUTLOOK, type RateOutlook } from '@/engine/rates';

/**
 * The rate outlook from /api/rates, fetched at most once a day per browser. Until it arrives, or
 * when it cannot be fetched, the copy bundled with the app is used, so the page never waits on it.
 */
const STORAGE_KEY = 'finly:rates:v1';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

let current: RateOutlook = readStored() ?? BUNDLED_OUTLOOK;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function isRateOutlook(v: unknown): v is RateOutlook {
  const o = v as RateOutlook;
  return (
    !!o &&
    typeof o.fetchedAt === 'string' &&
    Number.isFinite(o.policyRate?.value) &&
    typeof o.policyRate?.date === 'string' &&
    Array.isArray(o.policyHistory) &&
    o.policyHistory.every((h) => typeof h.month === 'string' && Number.isFinite(h.value)) &&
    Array.isArray(o.forecast?.path) &&
    o.forecast.path.length > 0 &&
    o.forecast.path.every((p) => typeof p.date === 'string' && Number.isFinite(p.value))
  );
}

function readStored(): RateOutlook | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return isRateOutlook(v) ? v : null;
  } catch {
    return null;
  }
}

/** Keeps whichever copy has the newer policy rate date, so an old cache never replaces newer bundled data. */
function newer(a: RateOutlook, b: RateOutlook): RateOutlook {
  return a.policyRate.date >= b.policyRate.date ? a : b;
}

function refresh(): Promise<void> {
  if (inflight) return inflight;
  const stored = readStored();
  if (stored && Date.now() - Date.parse(stored.fetchedAt) < MAX_AGE_MS) return Promise.resolve();
  inflight = fetch('/api/rates', { headers: { accept: 'application/json' } })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: unknown) => {
      if (!isRateOutlook(data)) return;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        // Storage blocked: the in-memory copy still serves this session.
      }
      current = newer(data, BUNDLED_OUTLOOK);
      listeners.forEach((l) => l());
    })
    .catch(() => {
      // Offline, or /api is not served (plain `vite preview`): keep the bundled outlook.
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

current = newer(current, BUNDLED_OUTLOOK);

export function useRateOutlook(): RateOutlook {
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
