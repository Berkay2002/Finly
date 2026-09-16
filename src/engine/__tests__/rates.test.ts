import { describe, expect, it, vi } from 'vitest';
import { buildOutlook, GET } from '../../../api/rates';
import { debtPayoff, debtSchedule, repaymentOrder } from '../debts';
import {
  BUNDLED_OUTLOOK,
  csnRateDecided,
  csnRateForYear,
  fixedRateResets,
  forecastRates,
  policyRateAt,
  rateAt,
  rateShock,
  variableMortgageMargin,
  type RateOutlook,
} from '../rates';
import type { Debt } from '../types';
import { NOW } from './fixtures';

const loan = (partial: Partial<Debt> & { kind: Debt['kind'] }): Debt => ({
  id: partial.id ?? partial.kind,
  name: partial.name ?? partial.kind,
  balance: 0,
  payment: 0,
  frequency: 'monthly',
  ...partial,
});

/** Policy rate flat at 2 % until today, forecast to rise one point from the next quarter on. */
const rising: RateOutlook = {
  source: 'bundled',
  fetchedAt: '2026-09-16T00:00:00.000Z',
  policyRate: { date: '2026-09-16', value: 2 },
  policyHistory: [],
  forecast: {
    round: 'test',
    published: '2026-06-17',
    path: [
      { date: '2026-09-30', value: 2 },
      { date: '2026-12-31', value: 3 },
    ],
  },
};

describe('policyRateAt', () => {
  it('uses monthly history behind, today now, and the forecast change ahead', () => {
    expect(policyRateAt(BUNDLED_OUTLOOK, new Date(2024, 4, 10))).toBe(3.845);
    expect(policyRateAt(BUNDLED_OUTLOOK, NOW)).toBe(1.75);
    // Q4 2027 forecast 2.00 against 1.76 for today's quarter: 1.75 + 0.24.
    expect(policyRateAt(BUNDLED_OUTLOOK, new Date(2027, 11, 15))).toBeCloseTo(1.99, 5);
    // Past the end of the path the last value holds.
    expect(policyRateAt(BUNDLED_OUTLOOK, new Date(2031, 5, 1))).toBeCloseTo(1.75 + 2.2 - 1.76, 5);
  });
});

describe('csnRateForYear', () => {
  it('returns decided rates as they are', () => {
    expect(csnRateForYear(BUNDLED_OUTLOOK, 2026)).toBe(2.135);
    expect(csnRateForYear(BUNDLED_OUTLOOK, 2022)).toBe(0);
  });

  it('moves the last decided rate by 70 % of the change in the three-year average policy rate', () => {
    const flat: RateOutlook = { ...rising, forecast: { ...rising.forecast, path: [{ date: '2026-09-30', value: 2 }] } };
    expect(csnRateForYear(flat, 2027)).toBe(2.135);
    // By 2030 the whole window (Nov 2026 to Oct 2029) sits one point above the 2026 window.
    expect(csnRateForYear(rising, 2030)).toBeCloseTo(2.135 + 0.7, 3);
  });

  it('knows which years CSN has decided', () => {
    expect(csnRateDecided(2026)).toBe(true);
    expect(csnRateDecided(2027)).toBe(false);
  });

  it('projects a lower rate for 2027 as the high rates of 2023 leave the window', () => {
    const next = csnRateForYear(BUNDLED_OUTLOOK, 2027);
    expect(next).toBeLessThan(2.135);
    expect(next).toBeGreaterThan(1.3);
  });
});

describe('rateAt', () => {
  const now = NOW;
  const later = new Date(2027, 2, 15);

  it('moves a rörlig bolån with the policy rate', () => {
    const d = loan({ kind: 'mortgage', rate: 3, rateType: 'variable', balance: 1_000_000 });
    expect(rateAt(d, later, now, rising, 1)).toBeCloseTo(4, 5);
  });

  it('holds a bunden bolån until the villkorsändringsdag, then prices it at policy rate plus margin', () => {
    const d = loan({ kind: 'mortgage', rate: 2.5, rateType: 'fixed', rateFixedUntil: '2027-01-31', balance: 1_000_000 });
    expect(rateAt(d, new Date(2026, 11, 15), now, rising, 1)).toBe(2.5);
    expect(rateAt(d, later, now, rising, 1)).toBeCloseTo(3 + 1, 5);
  });

  it('treats an old mortgage with an end date as bunden', () => {
    const d = loan({ kind: 'mortgage', rate: 2.5, rateFixedUntil: '2030-01-31', balance: 1 });
    expect(rateAt(d, later, now, rising, 1)).toBe(2.5);
  });

  it('follows CSN year by year and leaves other loans alone', () => {
    const csn = loan({ kind: 'csn', rate: 2.135 });
    expect(rateAt(csn, new Date(2030, 5, 1), now, rising, 1)).toBeCloseTo(2.135 + 0.7, 3);
    expect(rateAt(loan({ kind: 'car', rate: 7 }), later, now, rising, 1)).toBe(7);
    expect(rateAt(loan({ kind: 'car' }), later, now, rising, 1)).toBeUndefined();
  });

  it("uses a typed CSN rate only in the year it was entered for, CSN's rate in the others", () => {
    const typed = loan({ kind: 'csn', rate: 1.81, rateYear: 2026 });
    expect(rateAt(typed, new Date(2026, 11, 1), now, BUNDLED_OUTLOOK, 1)).toBe(1.81);
    // Typing 1.81 for 2026 does not pull 2027 down by CSN's expected drop from 2.135.
    expect(rateAt(typed, later, now, BUNDLED_OUTLOOK, 1)).toBe(csnRateForYear(BUNDLED_OUTLOOK, 2027));
    // Looked at in 2027, a rate entered in 2026 is out of date: 2027 follows CSN.
    const nextYear = new Date(2027, 5, 1);
    expect(rateAt(typed, nextYear, nextYear, rising, 1)).toBe(csnRateForYear(rising, 2027));
  });
});

describe('variableMortgageMargin', () => {
  it("prefers the household's own rörliga delar, weighted by balance", () => {
    const debts = [
      loan({ id: 'a', kind: 'mortgage', rate: 3, rateType: 'variable', balance: 1_000_000 }),
      loan({ id: 'b', kind: 'mortgage', rate: 4, rateType: 'variable', balance: 3_000_000 }),
    ];
    expect(variableMortgageMargin(rising, debts, NOW)).toBeCloseTo(3.75 - 2, 5);
  });

  it("falls back to SCB's average rörlig rate over the policy rate", () => {
    // July 2026: 2.74 % average against a 1.75 % policy rate.
    expect(variableMortgageMargin(BUNDLED_OUTLOOK, [], NOW)).toBeCloseTo(0.99, 5);
  });
});

describe('payoff with changing rates', () => {
  it('costs more interest when rates rise', () => {
    const d = loan({ kind: 'mortgage', rate: 3, rateType: 'variable', balance: 1_200_000, amortization: 5000 });
    const today = debtPayoff(d, NOW)!;
    const ahead = debtPayoff(d, NOW, forecastRates(d, NOW, rising, [d]))!;
    expect(ahead.months).toBe(today.months);
    expect(ahead.totalInterest!).toBeGreaterThan(today.totalInterest!);
  });

  it('builds a monthly schedule, flat for loans it cannot split and zero once paid off', () => {
    const d = loan({ kind: 'mortgage', rate: 3, rateType: 'variable', balance: 10_000, amortization: 5000 });
    const rows = debtSchedule(d, NOW, 4, forecastRates(d, NOW, rising, [d]));
    expect(rows.map((r) => r.principal)).toEqual([5000, 5000, 0, 0]);
    // The first row is next month, already in the fourth quarter: 3 % + one point.
    expect(rows[0].rate).toBeCloseTo(4, 5);
    expect(rows[0].interest).toBeCloseTo(10_000 * 0.04 / 12, 5);
    const flat = debtSchedule(loan({ kind: 'personal', payment: 900 }), NOW, 2);
    expect(flat.map((r) => r.payment)).toEqual([900, 900]);
  });
});

describe('fixedRateResets and rateShock', () => {
  const variable = loan({ id: 'v', kind: 'mortgage', rate: 3, rateType: 'variable', balance: 1_000_000 });
  const soon = loan({ id: 's', kind: 'mortgage', rate: 2, rateType: 'fixed', rateFixedUntil: '2026-11-30', balance: 1_200_000 });
  const late = loan({ id: 'l', kind: 'mortgage', rate: 2, rateType: 'fixed', rateFixedUntil: '2029-11-30', balance: 800_000 });

  it('lists bundna delar resetting soon with the expected new rate', () => {
    const resets = fixedRateResets([variable, soon, late], NOW, rising);
    expect(resets.map((r) => r.debt.id)).toEqual(['s']);
    // Margin 1 from the rörlig del; policy rate in Q4 is 3.
    expect(resets[0].newRate).toBeCloseTo(4, 5);
    expect(resets[0].monthlyChange).toBeCloseTo((1_200_000 * 2) / 100 / 12, 5);
    expect(resets[0].monthlyChangeAfterDeduction).toBeCloseTo(resets[0].monthlyChange * 0.7, 5);
  });

  it('counts only debt whose rate can move within a year', () => {
    const shock = rateShock([variable, soon, late, loan({ kind: 'car', rate: 7, balance: 90_000 })], NOW);
    expect(shock.exposedBalance).toBe(2_200_000);
    expect(shock.monthly).toBeCloseTo(22_000 / 12, 5);
  });

  it('puts extra money into rörliga delar before bundna', () => {
    const cheapVariable = { ...variable, rate: 2.2 };
    expect(repaymentOrder([late, cheapVariable]).map((d) => d.id)).toEqual(['v', 'l']);
  });
});

describe('/api/rates', () => {
  const swea = [
    { date: '2026-08-31', value: 1.75 },
    { date: '2026-09-01', value: 1.75 },
    { date: '2026-09-02', value: null },
    { date: '2026-09-15', value: 2 },
  ];
  const forecasts = {
    data: [
      {
        vintages: [
          { metadata: { policy_round: '2026:1', policy_round_end_dtm: '2026-03-20' }, observations: [{ dt: '2026-12-31', value: 9 }] },
          {
            metadata: { policy_round: '2026:2', policy_round_end_dtm: '2026-06-17T00:00:00' },
            observations: [
              { dt: '1994-03-31', value: 7 },
              { dt: '2026-09-30', value: 1.76 },
              { dt: '2026-12-31', value: 1.82 },
            ],
          },
        ],
      },
    ],
  };

  it('turns the Riksbank answers into a RateOutlook with the latest forecast', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) =>
      Response.json(String(url).includes('swea') ? swea : forecasts),
    ) as unknown as typeof fetch;
    const out = await buildOutlook(new Date('2026-09-16T12:00:00Z'), fetcher);
    expect(String(vi.mocked(fetcher).mock.calls[0][0])).toContain('/SECBREPOEFF/2022-11-01/2026-09-16');
    expect(out.policyRate).toEqual({ date: '2026-09-15', value: 2 });
    expect(out.policyHistory).toEqual([
      { month: '2026-08', value: 1.75 },
      { month: '2026-09', value: 1.875 },
    ]);
    expect(out.forecast).toEqual({
      round: '2026:2',
      published: '2026-06-17',
      path: [
        { date: '2026-09-30', value: 1.76 },
        { date: '2026-12-31', value: 1.82 },
      ],
    });
  });

  it('answers 502 with a short cache when the Riksbank fails', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('slow down', { status: 429 }));
    const res = await GET();
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toContain('s-maxage=900');
    spy.mockRestore();
  });
});
