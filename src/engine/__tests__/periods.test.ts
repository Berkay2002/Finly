import { describe, expect, it } from 'vitest';
import { lumpPayment } from '../periods';

describe('lumpPayment', () => {
  // A quarterly CSN payment due 26 February 2027, seen from different months.
  const at = (y: number, m: number) => lumpPayment(4407, 3, '2027-02-26', new Date(y, m - 1, 15));

  it('is nothing for monthly or undated items', () => {
    expect(lumpPayment(100, 1, '2027-02-26', new Date(2026, 8, 15))).toBeNull();
    expect(lumpPayment(100, 3, undefined, new Date(2026, 8, 15))).toBeNull();
    expect(lumpPayment(0, 3, '2027-02-26', new Date(2026, 8, 15))).toBeNull();
  });

  it('holds money back in the months before the due month and pays it in the due month', () => {
    expect(at(2026, 12)).toMatchObject({ paidThisMonth: false, part: 1, of: 3 });
    expect(at(2027, 1)).toMatchObject({ paidThisMonth: false, part: 2, of: 3 });
    expect(at(2027, 2)).toMatchObject({ paidThisMonth: true, part: 3, of: 3, amount: 4407 });
    expect(at(2027, 2)!.due).toEqual(new Date(2027, 1, 26));
  });

  it('has no part before the first covered month', () => {
    expect(at(2026, 11)).toMatchObject({ paidThisMonth: false, of: 3 });
    expect(at(2026, 11)!.part).toBeUndefined();
  });

  it('rolls a past due date forward to the next one', () => {
    expect(at(2027, 4)).toMatchObject({ paidThisMonth: false, part: 2, of: 3 });
    expect(at(2027, 5)).toMatchObject({ paidThisMonth: true, part: 3 });
    expect(at(2027, 5)!.due).toEqual(new Date(2027, 4, 26));
  });
});
