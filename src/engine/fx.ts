import type { FinancialPlan } from './types';

/**
 * Units of each currency per 1 EUR, by month (YYYY-MM): the ECB's reference rates as Frankfurter serves them
 * (lib/fx.ts). A finished month holds its average, the running month the latest rate. EUR itself is always 1.
 */
export type FxRates = Record<string, Record<string, number>>;

/** A currency per EUR in `month`: that month's rate, else the newest month before it, else the oldest on record. */
function perEur(fx: FxRates | undefined, currency: string, month: string): number | undefined {
  if (currency === 'EUR') return 1;
  const series = fx?.[currency];
  if (!series) return undefined;
  const months = Object.keys(series).sort();
  const at = months.filter((m) => m <= month).pop() ?? months[0];
  const v = at === undefined ? undefined : series[at];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
}

/** What one unit of `from` is worth in `to` in `month`; undefined while a rate is missing. Months ahead use the latest rate. */
export function fxRate(fx: FxRates | undefined, from: string, to: string, month: string): number | undefined {
  if (from === to) return 1;
  const a = perEur(fx, from, month);
  const b = perEur(fx, to, month);
  return a && b ? b / a : undefined;
}

/** Whether an expense is entered in another currency than the plan's. */
export function isForeign(e: { currency?: string }, planCurrency: string): e is { currency: string } {
  return !!e.currency && e.currency !== planCurrency;
}

/**
 * The plan with each expense entered in another currency turned into the plan currency at `month`'s rate, so a
 * EUR subscription costs what that month's rate makes it. Confirmed bills (`actuals`) are left alone: they are
 * what left the account, already in the plan currency. An item whose rate is not known yet (offline before the
 * first fetch) keeps its currency and amount, which also makes calling this twice harmless.
 */
export function inPlanCurrency(plan: FinancialPlan, month: string): FinancialPlan {
  if (!plan.expenses.some((e) => isForeign(e, plan.currency))) return plan;
  return {
    ...plan,
    expenses: plan.expenses.map((e) => {
      if (!isForeign(e, plan.currency)) return e;
      const r = fxRate(plan.fx, e.currency, plan.currency, month);
      if (!r) return e;
      const { currency: _drop, ...rest } = e;
      void _drop;
      return { ...rest, amount: e.amount * r, ...(e.range ? { range: { low: e.range.low * r, high: e.range.high * r } } : {}) };
    }),
  };
}

/** The currencies to fetch rates for: every foreign expense currency plus the plan's own. Empty when nothing is foreign. */
export function fxCurrencies(plan: Pick<FinancialPlan, 'currency' | 'expenses'>): string[] {
  const foreign = plan.expenses.filter((e) => isForeign(e, plan.currency)).map((e) => e.currency!);
  return foreign.length ? [...new Set([...foreign, plan.currency])].filter((c) => c !== 'EUR').sort() : [];
}

/** Rates reduced to the one month a closed month needs (see `freezePlan`). */
export function fxForMonth(fx: FxRates, month: string): FxRates {
  return Object.fromEntries(
    Object.keys(fx).flatMap((c) => {
      const v = perEur(fx, c, month);
      return v ? [[c, { [month]: v }]] : [];
    }),
  );
}

/**
 * Daily rates per EUR (`{ '2026-09-16': { SEK: 11.29 } }`) as monthly rates: a finished month's average, and for
 * `runningMonth` the latest rate, which is the best guess for what its payments and later ones will cost.
 */
export function monthlyRates(daily: Record<string, Record<string, number>>, runningMonth: string): FxRates {
  const acc: Record<string, Record<string, { sum: number; n: number; last: number }>> = {};
  for (const date of Object.keys(daily).sort()) {
    const month = date.slice(0, 7);
    for (const [c, v] of Object.entries(daily[date] ?? {})) {
      if (!(typeof v === 'number' && Number.isFinite(v) && v > 0)) continue;
      const s = ((acc[c] ??= {})[month] ??= { sum: 0, n: 0, last: v });
      s.sum += v;
      s.n += 1;
      s.last = v;
    }
  }
  const round = (n: number) => Math.round(n * 1e5) / 1e5;
  return Object.fromEntries(
    Object.entries(acc).map(([c, months]) => [
      c,
      Object.fromEntries(Object.entries(months).map(([m, s]) => [m, round(m === runningMonth ? s.last : s.sum / s.n)])),
    ]),
  );
}

/** `next` laid over `current`, or null when it changes nothing (so an unchanged refresh does not touch the plan). */
export function mergeFx(current: FxRates | undefined, next: FxRates): FxRates | null {
  let changed = false;
  const out: FxRates = { ...current };
  for (const [c, months] of Object.entries(next)) {
    for (const [m, v] of Object.entries(months)) {
      if (out[c]?.[m] === v) continue;
      out[c] = { ...out[c], [m]: v };
      changed = true;
    }
  }
  return changed ? out : null;
}
