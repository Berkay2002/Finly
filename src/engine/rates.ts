import { addMonths } from 'date-fns';
import { INTEREST_DEDUCTION_RATE, isDeductible, mortgageRateType, type RateAt } from './debts';
import type { Debt } from './types';

/*
 * Where loan rates are heading. Estimates only: the Riksbank revises its forecast at every policy
 * meeting and has often been wrong. See docs/swedish-loans.md ("Rates ahead").
 */

export interface RateOutlook {
  /** `riksbank` when fetched through /api/rates; `bundled` for the copy shipped with the app. */
  source: 'riksbank' | 'bundled';
  /** When the data was fetched (ISO timestamp). */
  fetchedAt: string;
  /** Today's policy rate (styrränta), percent. */
  policyRate: { date: string; value: number };
  /** Monthly average policy rate (YYYY-MM), oldest first, back to at least November four years ago. */
  policyHistory: { month: string; value: number }[];
  /** The Riksbank's latest policy rate forecast: quarterly averages, each dated at the quarter's end. */
  forecast: { round: string; published: string; path: { date: string; value: number }[] };
}

/**
 * Shipped with the app so forecasts work offline and when the Riksbank API is down. Riksbank SWEA
 * (SECBREPOEFF) up to 16 Sep 2026, and the forecast from policy round 2026:2 (June 2026).
 */
export const BUNDLED_OUTLOOK: RateOutlook = {
  source: 'bundled',
  fetchedAt: '2026-09-16T00:00:00.000Z',
  policyRate: { date: '2026-09-16', value: 1.75 },
  policyHistory: [
    ['2022-11', 1.784], ['2022-12', 2.5], ['2023-01', 2.5], ['2023-02', 2.75], ['2023-03', 3], ['2023-04', 3],
    ['2023-05', 3.476], ['2023-06', 3.5], ['2023-07', 3.726], ['2023-08', 3.75], ['2023-09', 3.786], ['2023-10', 4],
    ['2023-11', 4], ['2023-12', 4], ['2024-01', 4], ['2024-02', 4], ['2024-03', 4], ['2024-04', 4],
    ['2024-05', 3.845], ['2024-06', 3.75], ['2024-07', 3.75], ['2024-08', 3.659], ['2024-09', 3.5], ['2024-10', 3.261],
    ['2024-11', 2.94], ['2024-12', 2.75], ['2025-01', 2.536], ['2025-02', 2.275], ['2025-03', 2.25], ['2025-04', 2.25],
    ['2025-05', 2.25], ['2025-06', 2.197], ['2025-07', 2], ['2025-08', 2], ['2025-09', 2], ['2025-10', 1.75],
    ['2025-11', 1.75], ['2025-12', 1.75], ['2026-01', 1.75], ['2026-02', 1.75], ['2026-03', 1.75], ['2026-04', 1.75],
    ['2026-05', 1.75], ['2026-06', 1.75], ['2026-07', 1.75], ['2026-08', 1.75], ['2026-09', 1.75],
  ].map(([month, value]) => ({ month: month as string, value: value as number })),
  forecast: {
    round: '2026:2',
    published: '2026-06-17',
    path: [
      ['2025-12-31', 1.75], ['2026-03-31', 1.75], ['2026-06-30', 1.75], ['2026-09-30', 1.76], ['2026-12-31', 1.82],
      ['2027-03-31', 1.89], ['2027-06-30', 1.93], ['2027-09-30', 1.97], ['2027-12-31', 2], ['2028-03-31', 2.04],
      ['2028-06-30', 2.07], ['2028-09-30', 2.1], ['2028-12-31', 2.13], ['2029-03-31', 2.17], ['2029-06-30', 2.2],
    ].map(([date, value]) => ({ date: date as string, value: value as number })),
  },
};

/** CSN's rate on studielån and annuitetslån by year (csn.se, "Ränta och avgifter"). Add each December. */
export const CSN_RATES: Record<number, number> = {
  2011: 1.9,
  2012: 1.5,
  2013: 1.3,
  2014: 1.2,
  2015: 1.0,
  2016: 0.6,
  2017: 0.34,
  2018: 0.13,
  2019: 0.16,
  2020: 0.16,
  2021: 0.05,
  2022: 0,
  2023: 0.59,
  2024: 1.23,
  2025: 1.981,
  2026: 2.135,
};

/** Whether CSN has published the rate for `year`; otherwise `csnRateForYear` estimates it. */
export function csnRateDecided(year: number): boolean {
  return CSN_RATES[year] !== undefined;
}

/** Share of the state's borrowing cost borrowers pay: CSN's base rate is subsidised by 30 %. */
export const CSN_BORROWER_SHARE = 0.7;

/**
 * Average interest on new rörliga bolån (up to three months' fixation) to households, SCB
 * finansmarknadsstatistik. Gives the usual margin over the policy rate when a bunden del resets.
 */
export const MORTGAGE_VARIABLE_AVERAGE = { month: '2026-07', rate: 2.74 };

const parseIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const quarterIndex = (d: Date) => d.getFullYear() * 4 + Math.floor(d.getMonth() / 3);

function forecastForQuarter(o: RateOutlook, q: number): number | undefined {
  let best: { q: number; value: number } | undefined;
  for (const p of o.forecast.path) {
    const pq = quarterIndex(parseIso(p.date));
    if (pq === q) return p.value;
    if (pq < q && (!best || pq > best.q)) best = { q: pq, value: p.value };
  }
  return best?.value ?? o.forecast.path[0]?.value;
}

/**
 * Policy rate in the month of `date`: the monthly average for past months, today's rate for this
 * month, and today's rate moved by the forecast's change for months ahead (so the path starts from
 * where the rate really is, not from the forecast's own starting point).
 */
export function policyRateAt(o: RateOutlook, date: Date): number {
  const today = parseIso(o.policyRate.date);
  const key = monthKey(date);
  const todayKey = monthKey(today);
  if (key < todayKey) {
    const hit = o.policyHistory.find((h) => h.month === key);
    if (hit) return hit.value;
    const first = o.policyHistory[0];
    return first && key < first.month ? first.value : o.policyRate.value;
  }
  if (key === todayKey) return o.policyRate.value;
  const ahead = forecastForQuarter(o, quarterIndex(date));
  const now = forecastForQuarter(o, quarterIndex(today));
  if (ahead === undefined || now === undefined) return o.policyRate.value;
  return o.policyRate.value + (ahead - now);
}

/**
 * Average policy rate over CSN's window for a year. The rate is decided in the autumn before, from
 * "november tre år bakåt i tiden till och med oktober innevarande år": for 2026, Nov 2022 to Oct 2025.
 */
function csnWindowAverage(o: RateOutlook, year: number): number {
  let total = 0;
  for (let i = 0; i < 36; i += 1) total += policyRateAt(o, new Date(year - 4, 10 + i, 15));
  return total / 36;
}

/**
 * CSN's rate for a year: the decided rate when known, otherwise the last decided rate moved by 70 % of
 * the change in the average policy rate over CSN's three-year window. The real base is the state's
 * borrowing cost on bonds and bills, which the policy rate only approximates. Predicting each of 2024–2026
 * from the year before came out 0.11, 0.14 and 0.35 percentage points too high. The credit-loss markup is
 * assumed unchanged.
 */
export function csnRateForYear(o: RateOutlook, year: number): number {
  if (CSN_RATES[year] !== undefined) return CSN_RATES[year];
  const years = Object.keys(CSN_RATES).map(Number);
  const first = Math.min(...years);
  const last = Math.max(...years);
  if (year < first) return CSN_RATES[first];
  // A payoff simulation asks once per month; the answer only changes per year.
  let cache = csnCache.get(o);
  if (!cache) csnCache.set(o, (cache = new Map()));
  const hit = cache.get(year);
  if (hit !== undefined) return hit;
  const projected = CSN_RATES[last] + CSN_BORROWER_SHARE * (csnWindowAverage(o, year) - csnWindowAverage(o, last));
  const rate = Math.max(0, Math.round(projected * 1000) / 1000);
  cache.set(year, rate);
  return rate;
}

const csnCache = new WeakMap<RateOutlook, Map<number, number>>();

/**
 * Margin a rörlig bolån carries over the policy rate: from the household's own rörliga delar when they
 * have any (weighted by balance), otherwise the market average from SCB.
 */
export function variableMortgageMargin(o: RateOutlook, debts: Debt[], now: Date): number {
  const own = debts.filter(
    (d) => d.kind === 'mortgage' && mortgageRateType(d) === 'variable' && d.rate !== undefined && d.balance > 0,
  );
  const balance = own.reduce((a, d) => a + d.balance, 0);
  if (balance > 0) {
    const rate = own.reduce((a, d) => a + d.rate! * d.balance, 0) / balance;
    return rate - policyRateAt(o, now);
  }
  return MORTGAGE_VARIABLE_AVERAGE.rate - policyRateAt(o, parseIso(`${MORTGAGE_VARIABLE_AVERAGE.month}-15`));
}

/**
 * A loan's expected yearly rate (percent) in the month of `date`.
 * - Rörlig bolån: today's rate moved with the policy rate forecast.
 * - Bunden bolån: today's rate until the villkorsändringsdag, then the policy rate plus the rörlig margin.
 * - CSN: the entered rate in its `rateYear`, CSN's decided or projected rate in every other year. CSN
 *   charges every borrower the same rate, so a rate typed for one year says nothing about the next.
 * - Other loans: today's rate. Their pricing is set by each lender and follows the market loosely.
 */
export function rateAt(d: Debt, date: Date, now: Date, o: RateOutlook, margin: number): number | undefined {
  if (d.rate === undefined || !Number.isFinite(d.rate)) return undefined;
  if (d.kind === 'csn') {
    const year = date.getFullYear();
    return year === (d.rateYear ?? now.getFullYear()) ? d.rate : csnRateForYear(o, year);
  }
  if (d.kind !== 'mortgage') return d.rate;
  if (mortgageRateType(d) === 'variable') return Math.max(0, d.rate + policyRateAt(o, date) - policyRateAt(o, now));
  if (!d.rateFixedUntil || date < parseIso(d.rateFixedUntil)) return d.rate;
  return Math.max(0, policyRateAt(o, date) + margin);
}

/** `rateAt` for one loan, ready to pass to `debtPayoff` and `debtSchedule`. */
export function forecastRates(d: Debt, now: Date, o: RateOutlook, debts: Debt[]): RateAt {
  const margin = variableMortgageMargin(o, debts, now);
  return (date) => rateAt(d, date, now, o, margin);
}

export interface FixedRateReset {
  debt: Debt;
  /** Villkorsändringsdag. */
  date: Date;
  /** True when the date has passed and the rate on file is probably out of date. */
  passed: boolean;
  /** Estimated rate after the reset, percent. */
  newRate: number;
  /** Change in monthly interest at today's balance, before and after ränteavdrag. */
  monthlyChange: number;
  monthlyChangeAfterDeduction: number;
}

/** Bundna bolån whose fixed period ends within `withinMonths`, or ended in the last three months. */
export function fixedRateResets(debts: Debt[], now: Date, o: RateOutlook, withinMonths = 3): FixedRateReset[] {
  const margin = variableMortgageMargin(o, debts, now);
  const out: FixedRateReset[] = [];
  for (const d of debts) {
    if (d.kind !== 'mortgage' || mortgageRateType(d) !== 'fixed' || !d.rateFixedUntil || d.rate === undefined) continue;
    const date = parseIso(d.rateFixedUntil);
    if (date > addMonths(now, withinMonths) || date < addMonths(now, -3)) continue;
    const newRate = Math.max(0, policyRateAt(o, date < now ? now : date) + margin);
    const monthlyChange = (d.balance * (newRate - d.rate)) / 100 / 12;
    out.push({
      debt: d,
      date,
      passed: date < now,
      newRate,
      monthlyChange,
      monthlyChangeAfterDeduction: monthlyChange * (isDeductible(d) ? 1 - INTEREST_DEDUCTION_RATE : 1),
    });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export interface RateShock {
  /** Mortgage debt whose rate can move within the horizon: rörliga delar and bundna ending by then. */
  exposedBalance: number;
  /** Extra interest per month if rates rise by `points`, before and after ränteavdrag. */
  monthly: number;
  monthlyAfterDeduction: number;
}

/** What a rate rise of `points` percentage points costs within `withinMonths`. */
export function rateShock(debts: Debt[], now: Date, points = 1, withinMonths = 12): RateShock {
  const horizon = addMonths(now, withinMonths);
  let exposedBalance = 0;
  for (const d of debts) {
    if (d.kind !== 'mortgage' || d.balance <= 0) continue;
    const moves =
      mortgageRateType(d) === 'variable' || !d.rateFixedUntil || parseIso(d.rateFixedUntil) <= horizon;
    // A bunden del without an end date is treated as able to move: the plan cannot tell when it resets.
    if (moves) exposedBalance += d.balance;
  }
  const monthly = (exposedBalance * points) / 100 / 12;
  // Mortgages always give ränteavdrag; the 21 % band above 100 000 kr a year is ignored here.
  return { exposedBalance, monthly, monthlyAfterDeduction: monthly * (1 - INTEREST_DEDUCTION_RATE) };
}
