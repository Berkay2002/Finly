import { messages } from '@/i18n';
import type { Frequency, Occurrences } from './types';

/** Months per occurrence, for interval frequencies. */
const MONTHS_PER_PERIOD: Record<Exclude<Frequency, 'once' | 'weekly'>, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

const WEEKS_PER_MONTH = 52 / 12;

/**
 * Monthly equivalent of an amount at a given frequency.
 * One-off amounts are spread over 12 months so that they are provisioned
 * for in the monthly picture (PRD §2.3, §11).
 */
export function toMonthly(amount: number, frequency: Frequency): number {
  if (!Number.isFinite(amount)) return 0;
  switch (frequency) {
    case 'weekly':
      return amount * WEEKS_PER_MONTH;
    case 'monthly':
      return amount;
    case 'quarterly':
      return amount / 3;
    case 'yearly':
      return amount / 12;
    case 'once':
      return amount / 12;
  }
}

/** Purchases per month. Invalid or negative counts give 0. */
export function occurrencesPerMonth(o: Occurrences): number {
  const times = Number.isFinite(o.times) && o.times > 0 ? o.times : 0;
  return o.per === 'week' ? times * WEEKS_PER_MONTH : o.per === 'year' ? times / 12 : times;
}

/** How many times `amount` is paid in a month: per purchase when priced that way, else by frequency. */
export function periodsPerMonth(item: { frequency: Frequency; occurrences?: Occurrences }): number {
  return item.occurrences ? occurrencesPerMonth(item.occurrences) : toMonthly(1, item.frequency);
}

/** The frequency stored alongside `occurrences`, so code that only reads `frequency` still sees a regular cost. */
export function frequencyForOccurrences(o: Occurrences): Frequency {
  return o.per === 'week' ? 'weekly' : o.per === 'year' ? 'yearly' : 'monthly';
}

export function monthlyToWeekly(monthly: number): number {
  return monthly / WEEKS_PER_MONTH;
}

export function monthlyToDaily(monthly: number): number {
  return (monthly * 12) / 365;
}

export function toAnnual(amount: number, frequency: Frequency): number {
  return toMonthly(amount, frequency) * 12;
}

export function monthsPerPeriod(frequency: Frequency): number | null {
  if (frequency === 'once' || frequency === 'weekly') return null;
  return MONTHS_PER_PERIOD[frequency];
}

/**
 * Whether an item is "irregular" and should appear in the upcoming calendar. An item priced per
 * purchase (a few flights a year) has no due date and is spread over the months instead.
 */
export function isIrregular(frequency: Frequency, occurrences?: Occurrences): boolean {
  if (occurrences) return false;
  return frequency === 'quarterly' || frequency === 'yearly' || frequency === 'once';
}

/** Labels in the current language. Read them when rendering; a copy taken at import keeps the old language. */
export const FREQUENCY_LABELS: Readonly<Record<Frequency, string>> = {
  get weekly() {
    return messages().taxonomy.frequencies.weekly;
  },
  get monthly() {
    return messages().taxonomy.frequencies.monthly;
  },
  get quarterly() {
    return messages().taxonomy.frequencies.quarterly;
  },
  get yearly() {
    return messages().taxonomy.frequencies.yearly;
  },
  get once() {
    return messages().taxonomy.frequencies.once;
  },
};

export const FREQUENCIES: Frequency[] = ['weekly', 'monthly', 'quarterly', 'yearly', 'once'];
