import { describe, expect, it } from 'vitest';
import { isIrregular, toAnnual, toMonthly } from '../frequency';

describe('toMonthly', () => {
  it('converts each frequency to a monthly equivalent (PRD §2.3)', () => {
    expect(toMonthly(12000, 'yearly')).toBe(1000);
    expect(toMonthly(6000, 'yearly')).toBe(500);
    expect(toMonthly(8000, 'yearly')).toBeCloseTo(666.67, 1);
    expect(toMonthly(3600, 'yearly')).toBe(300);
    expect(toMonthly(900, 'quarterly')).toBe(300);
    expect(toMonthly(100, 'weekly')).toBeCloseTo(433.33, 1);
    expect(toMonthly(500, 'monthly')).toBe(500);
  });

  it('spreads one-off amounts over 12 months', () => {
    expect(toMonthly(2400, 'once')).toBe(200);
  });

  it('is safe against non-finite input', () => {
    expect(toMonthly(NaN, 'monthly')).toBe(0);
    expect(toMonthly(Infinity, 'yearly')).toBe(0);
  });
});

describe('toAnnual', () => {
  it('is 12 × monthly', () => {
    expect(toAnnual(8500, 'monthly')).toBe(102000);
    expect(toAnnual(2300, 'yearly')).toBe(2300);
  });
});

describe('isIrregular', () => {
  it('flags quarterly, yearly and once', () => {
    expect(isIrregular('weekly')).toBe(false);
    expect(isIrregular('monthly')).toBe(false);
    expect(isIrregular('quarterly')).toBe(true);
    expect(isIrregular('yearly')).toBe(true);
    expect(isIrregular('once')).toBe(true);
  });
});
