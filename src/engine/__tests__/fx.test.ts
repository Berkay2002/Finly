import { describe, expect, it } from 'vitest';
import { fetchFx } from '@/lib/fx';
import { fxCurrencies, fxRate, inPlanCurrency, mergeFx, monthlyRates } from '../fx';
import { freezePlan } from '../history';
import { computeMetrics } from '../metrics';
import { upcomingExpenses } from '../projections';
import { emptyPlan, type FinancialPlan } from '../types';
import { expense } from './fixtures';

/** SEK and USD per EUR: the krona weakens from August to September. */
const FX = { SEK: { '2026-08': 11, '2026-09': 11.5 }, USD: { '2026-08': 1.1, '2026-09': 1.15 } };

function plan(extra: Partial<FinancialPlan> = {}): FinancialPlan {
  return {
    ...emptyPlan(new Date(2026, 0, 1)),
    fx: FX,
    expenses: [expense({ name: 'Claude', category: 'leisure', amount: 20, currency: 'EUR', tags: ['subscription'] })],
    ...extra,
  };
}

describe('fxRate', () => {
  it('crosses through EUR, falls back to the newest earlier month, and the oldest before any', () => {
    expect(fxRate(FX, 'EUR', 'SEK', '2026-09')).toBe(11.5);
    expect(fxRate(FX, 'USD', 'SEK', '2026-08')).toBeCloseTo(10);
    expect(fxRate(FX, 'EUR', 'SEK', '2027-03')).toBe(11.5);
    expect(fxRate(FX, 'EUR', 'SEK', '2025-01')).toBe(11);
    expect(fxRate(FX, 'NOK', 'SEK', '2026-09')).toBeUndefined();
    expect(fxRate(undefined, 'SEK', 'SEK', '2026-09')).toBe(1);
  });
});

describe('expenses in another currency', () => {
  it('cost what the month’s rate makes them', () => {
    expect(computeMetrics(plan(), new Date(2026, 7, 10)).lifestyleCost).toBeCloseTo(220);
    expect(computeMetrics(plan(), new Date(2026, 8, 10)).lifestyleCost).toBeCloseTo(230);
    // Months ahead run on the latest rate.
    expect(computeMetrics(plan(), new Date(2026, 10, 10)).lifestyleCost).toBeCloseTo(230);
  });

  it('price a quarterly payment ahead at the latest rate', () => {
    const p = plan({
      expenses: [expense({ name: 'Hosting', category: 'planned', amount: 100, currency: 'USD', frequency: 'quarterly', nextDate: '2026-11-05' })],
    });
    const due = upcomingExpenses(p, new Date(2026, 8, 17), 3);
    expect(due).toHaveLength(1);
    expect(due[0].amount).toBeCloseTo(1000);
  });

  it('converts range but not confirmed bills, and leaves an item without a rate alone', () => {
    const p = plan({
      expenses: [
        expense({ name: 'Trip', category: 'planned', amount: 0, fixed: false, range: { low: 10, high: 30 }, currency: 'EUR', actuals: { '2026-09': 250 } }),
        expense({ name: 'Ferry', category: 'planned', amount: 40, currency: 'NOK' }),
        expense({ name: 'Rent', category: 'home', amount: 9000 }),
      ],
    });
    const [trip, ferry, rent] = inPlanCurrency(p, '2026-09').expenses;
    expect(trip).toMatchObject({ range: { low: 115, high: 345 }, actuals: { '2026-09': 250 } });
    expect(trip.currency).toBeUndefined();
    expect(ferry).toBe(p.expenses[1]);
    expect(rent).toBe(p.expenses[2]);
    // Converting again changes nothing.
    expect(inPlanCurrency(inPlanCurrency(p, '2026-09'), '2026-09').expenses[0]).toMatchObject({ range: { low: 115 } });
  });

  it('lists what to fetch, and a closed month keeps only its own rates', () => {
    expect(fxCurrencies(plan())).toEqual(['SEK']);
    expect(fxCurrencies(plan({ expenses: [] }))).toEqual([]);
    expect(freezePlan(plan(), '2026-08').fx).toEqual({ SEK: { '2026-08': 11 }, USD: { '2026-08': 1.1 } });
  });
});

describe('monthlyRates and mergeFx', () => {
  const daily = { '2026-08-30': { SEK: 11 }, '2026-08-31': { SEK: 12 }, '2026-09-15': { SEK: 11.2 }, '2026-09-16': { SEK: 11.3 } };

  it('averages finished months and takes the latest rate for the running one', () => {
    expect(monthlyRates(daily, '2026-09')).toEqual({ SEK: { '2026-08': 11.5, '2026-09': 11.3 } });
  });

  it('reports no change as null', () => {
    expect(mergeFx(FX, { SEK: { '2026-09': 11.5 } })).toBeNull();
    expect(mergeFx(FX, { SEK: { '2026-09': 11.6 } })).toEqual({ ...FX, SEK: { '2026-08': 11, '2026-09': 11.6 } });
  });

  it('fetches 13 months from Frankfurter', async () => {
    let url = '';
    const fetcher = (async (u: string) => {
      url = u;
      return new Response(JSON.stringify({ base: 'EUR', rates: daily }));
    }) as unknown as typeof fetch;
    expect(await fetchFx(['EUR', 'SEK'], new Date(2026, 8, 17), fetcher)).toEqual({ SEK: { '2026-08': 11.5, '2026-09': 11.3 } });
    expect(url).toBe('https://api.frankfurter.dev/v1/2025-09-01..?symbols=SEK');
    expect(await fetchFx(['SEK'], new Date(), (async () => new Response('down', { status: 500 })) as unknown as typeof fetch)).toBeNull();
  });
});
