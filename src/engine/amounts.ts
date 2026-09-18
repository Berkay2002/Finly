import { periodsPerMonth } from './frequency';
import { tariffSpread } from './electricity';
import type { AmountRange, ElectricityTariff, Frequency, Occurrences } from './types';

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
  occurrences?: Occurrences;
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

  // A low of 0 is a real 0: the thing may not happen at all some months (fuel for a borrowed car). A high left at 0 is unset.
  const a = pos(range.low);
  const b = pos(range.high);
  const hi = Math.max(a, b);
  const lo = b ? Math.min(a, b) : a;
  const typical = amount > 0 ? amount : (lo + hi) / 2;
  return {
    low: hi ? Math.min(lo, typical) : typical,
    typical,
    high: Math.max(hi, typical),
  };
}

/** Same as {@link amountSpread} but converted to monthly equivalents (per purchase × purchases for `occurrences`). */
export function monthlySpread(item: Rangeable): AmountSpread {
  const s = amountSpread(item);
  const n = item.tariff ? 1 : periodsPerMonth(item);
  return { low: s.low * n, typical: s.typical * n, high: s.high * n };
}

/** True when the item's cost genuinely moves between periods. */
export function varies(item: Rangeable): boolean {
  const s = amountSpread(item);
  return s.high > s.low;
}
