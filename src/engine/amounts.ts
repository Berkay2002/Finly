import { toMonthly } from './frequency';
import { tariffSpread } from './electricity';
import type { AmountRange, ElectricityTariff, Frequency } from './types';

/**
 * Low / typical / high reading of one amount. For a fixed item all three are the same number;
 * for a variable item with a range they describe the band the cost normally moves within.
 */
export interface AmountSpread {
  low: number;
  typical: number;
  high: number;
}

export interface Rangeable {
  amount: number;
  frequency: Frequency;
  fixed?: boolean;
  range?: AmountRange;
  tariff?: ElectricityTariff;
}

const pos = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

/**
 * Per-period spread of an item. Rules:
 * - An electricity tariff, when present, decides all three figures.
 * - `fixed` items and items without a range collapse to `amount`.
 * - `typical` is `amount`, or the midpoint of the range when no typical amount was entered.
 * - A bound left at 0 means "same as typical".
 * - Bounds are ordered and widened so that low ≤ typical ≤ high always holds.
 */
export function amountSpread(item: Rangeable): AmountSpread {
  if (item.tariff) return tariffSpread(item.tariff);
  const amount = pos(item.amount);
  const range = item.fixed === false || item.fixed === undefined ? item.range : undefined;
  if (!range) return { low: amount, typical: amount, high: amount };

  const a = pos(range.low);
  const b = pos(range.high);
  const lo = Math.min(a || b, b || a);
  const hi = Math.max(a, b);
  const typical = amount > 0 ? amount : (lo + hi) / 2;
  return {
    low: Math.min(lo || typical, typical),
    typical,
    high: Math.max(hi || typical, typical),
  };
}

/** Same as {@link amountSpread} but converted to monthly equivalents. */
export function monthlySpread(item: Rangeable): AmountSpread {
  const s = amountSpread(item);
  return {
    low: toMonthly(s.low, item.frequency),
    typical: toMonthly(s.typical, item.frequency),
    high: toMonthly(s.high, item.frequency),
  };
}

/** True when the item's cost genuinely moves between periods. */
export function varies(item: Rangeable): boolean {
  const s = amountSpread(item);
  return s.high > s.low;
}
