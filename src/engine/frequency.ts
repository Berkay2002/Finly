import type { Frequency } from './types';

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

export function toAnnual(amount: number, frequency: Frequency): number {
  return toMonthly(amount, frequency) * 12;
}

export function monthsPerPeriod(frequency: Frequency): number | null {
  if (frequency === 'once' || frequency === 'weekly') return null;
  return MONTHS_PER_PERIOD[frequency];
}

/** Whether an item at this frequency is "irregular" and should appear in the upcoming calendar. */
export function isIrregular(frequency: Frequency): boolean {
  return frequency === 'quarterly' || frequency === 'yearly' || frequency === 'once';
}

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  once: 'One-off',
};

export const FREQUENCIES: Frequency[] = ['weekly', 'monthly', 'quarterly', 'yearly', 'once'];
