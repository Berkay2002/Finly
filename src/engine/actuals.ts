import { amountSpread } from './amounts';
import type { ExpenseItem } from './types';

/** One recorded bill. */
export interface ActualEntry {
  /** YYYY-MM the bill was paid in. */
  month: string;
  amount: number;
}

/** Everything recorded for an item, newest first. */
export interface ActualsHistory {
  entries: ActualEntry[];
  count: number;
  average: number;
  min: number;
  max: number;
}

export function actualsHistory(e: Pick<ExpenseItem, 'actuals'>): ActualsHistory | null {
  const entries = Object.entries(e.actuals ?? {})
    .filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v >= 0)
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => b.month.localeCompare(a.month));
  if (entries.length === 0) return null;
  const amounts = entries.map((x) => x.amount);
  return {
    entries,
    count: entries.length,
    average: amounts.reduce((a, b) => a + b, 0) / amounts.length,
    min: Math.min(...amounts),
    max: Math.max(...amounts),
  };
}

/** A better estimate than the one on file, derived from real bills. */
export interface EstimateSuggestion {
  typical: number;
  low: number;
  high: number;
  /** Number of bills the suggestion rests on. */
  basedOn: number;
  /** Oldest and newest month used. */
  from: string;
  to: string;
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/**
 * Suggests a typical amount and range from recorded bills once there are enough of them.
 * Returns null while fewer than `minBills` exist, for fixed or non-monthly items, or when the
 * current estimate already sits within `tolerance` of what the bills say.
 */
export function suggestFromActuals(
  e: Pick<ExpenseItem, 'fixed' | 'frequency' | 'amount' | 'range' | 'actuals'>,
  opts: { minBills?: number; tolerance?: number; window?: number } = {},
): EstimateSuggestion | null {
  const { minBills = 3, tolerance = 0.05, window = 12 } = opts;
  if (e.fixed || e.frequency !== 'monthly') return null;
  const history = actualsHistory(e);
  if (!history || history.count < minBills) return null;

  const recent = history.entries.slice(0, window);
  const amounts = recent.map((x) => x.amount);
  const step = amounts.every((a) => a >= 1000) ? 50 : 10;
  const typical = roundTo(amounts.reduce((a, b) => a + b, 0) / amounts.length, step);
  const low = roundTo(Math.min(...amounts), step);
  const high = roundTo(Math.max(...amounts), step);

  const current = amountSpread(e);
  const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(step, tolerance * Math.max(a, b));
  if (close(current.typical, typical) && close(current.low, low) && close(current.high, high)) return null;

  return {
    typical,
    low,
    high,
    basedOn: recent.length,
    from: recent[recent.length - 1].month,
    to: recent[0].month,
  };
}
