import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const data = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  },
  configurable: true,
});

const day = (sek: number[]) => sek.map((SEK_per_kWh) => ({ SEK_per_kWh }));

async function freshModule() {
  vi.resetModules();
  return import('../spotPrice');
}

beforeEach(() => {
  data.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 16));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('previousMonthKey', () => {
  it('handles the year boundary', async () => {
    const { previousMonthKey } = await freshModule();
    expect(previousMonthKey(new Date(2026, 0, 5))).toBe('2025-12');
    expect(previousMonthKey()).toBe('2026-08');
  });
});

describe('fetchSpotAverage', () => {
  it('averages every interval of the month and adds moms', async () => {
    const fetch = vi.fn(async (url: string) => {
      const d = Number(url.match(/-(\d\d)_SE3/)![1]);
      return new Response(JSON.stringify(day(d === 1 ? [0.4, 1.2] : [0.8])), { status: 200 });
    });
    vi.stubGlobal('fetch', fetch);
    const { fetchSpotAverage } = await freshModule();

    const avg = await fetchSpotAverage('SE3', '2026-02');
    expect(fetch).toHaveBeenCalledTimes(28);
    // every interval weighs the same: 29 × 0.8 SEK and one each of 0.4 and 1.2 → 0.8 SEK → 100 öre with moms
    expect(avg).toEqual({ area: 'SE3', month: '2026-02', oreInclVat: 100, days: 28 });
  });

  it('never has more than a few requests in flight', async () => {
    let inFlight = 0;
    let peak = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight--;
        return new Response(JSON.stringify(day([1])), { status: 200 });
      }),
    );
    const { fetchSpotAverage } = await freshModule();
    await fetchSpotAverage('SE4', '2026-08');
    expect(peak).toBeLessThanOrEqual(4);
  });

  it('downloads a finished month once, then serves it from storage across reloads', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(day([1])), { status: 200 }));
    vi.stubGlobal('fetch', fetch);

    let mod = await freshModule();
    await Promise.all([mod.fetchSpotAverage('SE3', '2026-08'), mod.fetchSpotAverage('SE3', '2026-08')]);
    expect(fetch).toHaveBeenCalledTimes(31);

    mod = await freshModule(); // a page reload
    const again = await mod.fetchSpotAverage('SE3', '2026-08');
    expect(again.oreInclVat).toBe(125);
    expect(fetch).toHaveBeenCalledTimes(31);
  });

  it('does not store the month in progress, and skips days that have not happened', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(day([1])), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const { fetchSpotAverage } = await freshModule();
    const avg = await fetchSpotAverage('SE3', '2026-09');
    expect(fetch).toHaveBeenCalledTimes(16);
    expect(avg.days).toBe(16);
    expect(data.size).toBe(0);
  });

  it('forgets a failed download so a retry can fetch again', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    const { fetchSpotAverage } = await freshModule();
    await expect(fetchSpotAverage('SE1', '2026-08')).rejects.toThrow('503');
    const calls = fetch.mock.calls.length;
    await expect(fetchSpotAverage('SE1', '2026-08')).rejects.toThrow();
    expect(fetch.mock.calls.length).toBeGreaterThan(calls);
  });
});
