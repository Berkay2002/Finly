import { addMonths, differenceInCalendarMonths, startOfMonth } from 'date-fns';

/**
 * A payment made once a quarter or once a year, as the viewed month sees it. The cost is spread over the
 * months the payment covers, so most months hold their share back for a bill due later; only in the due
 * month does the money actually leave.
 */
export interface LumpPayment {
  /** What is paid at the due date (the whole quarter or year, not the monthly share). */
  amount: number;
  /** The next due date on or after the viewed month. */
  due: Date;
  /** True in the month the payment is made. */
  paidThisMonth: boolean;
  /**
   * Which month of the covered period the viewed month is (1 = first, `of` = the due month). Missing when
   * the due date is more than one period away and the viewed month is not inside a covered period.
   */
  part?: number;
  of: number;
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Where the viewed month `now` sits relative to a payment of `amount` due every `step` months from `nextDate`. */
export function lumpPayment(amount: number, step: number, nextDate: string | undefined, now: Date): LumpPayment | null {
  if (!nextDate || step <= 1 || !(amount > 0)) return null;
  let due = parseIso(nextDate);
  if (Number.isNaN(due.getTime())) return null;
  const month = startOfMonth(now);
  // Roll a past due date forward to the next one.
  for (let guard = 0; due < month && guard < 240; guard += 1) due = addMonths(due, step);
  const ahead = differenceInCalendarMonths(due, month);
  return {
    amount,
    due,
    paidThisMonth: ahead === 0,
    part: ahead < step ? step - ahead : undefined,
    of: step,
  };
}
