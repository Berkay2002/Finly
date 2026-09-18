import { describe, expect, it } from 'vitest';
import { amountSpread, monthlySpread, varies } from '../amounts';

describe('amountSpread', () => {
  it('collapses fixed items and items without a range to their amount', () => {
    expect(amountSpread({ amount: 500, frequency: 'monthly', fixed: true })).toEqual({ low: 500, typical: 500, high: 500 });
    expect(amountSpread({ amount: 500, frequency: 'monthly', fixed: false })).toEqual({ low: 500, typical: 500, high: 500 });
  });

  it('ignores a range while the item is marked fixed', () => {
    const s = amountSpread({ amount: 500, frequency: 'monthly', fixed: true, range: { low: 300, high: 900 } });
    expect(s).toEqual({ low: 500, typical: 500, high: 500 });
  });

  it('keeps the typical amount and the entered bounds for a variable item', () => {
    const s = amountSpread({ amount: 500, frequency: 'monthly', fixed: false, range: { low: 300, high: 900 } });
    expect(s).toEqual({ low: 300, typical: 500, high: 900 });
  });

  it('budgets for the midpoint when only a range was entered', () => {
    const s = amountSpread({ amount: 0, frequency: 'monthly', fixed: false, range: { low: 300, high: 900 } });
    expect(s).toEqual({ low: 300, typical: 600, high: 900 });
  });

  it('takes a low of 0 as a real 0, and a high left at 0 as "same as typical"', () => {
    expect(amountSpread({ amount: 500, frequency: 'monthly', fixed: false, range: { low: 0, high: 900 } })).toEqual({
      low: 0,
      typical: 500,
      high: 900,
    });
    expect(amountSpread({ amount: 500, frequency: 'monthly', fixed: false, range: { low: 300, high: 0 } })).toEqual({
      low: 300,
      typical: 500,
      high: 500,
    });
  });

  it('orders swapped bounds and widens them around the typical amount', () => {
    expect(amountSpread({ amount: 500, frequency: 'monthly', fixed: false, range: { low: 900, high: 300 } })).toEqual({
      low: 300,
      typical: 500,
      high: 900,
    });
    // Typical outside the entered band: the band stretches to include it.
    expect(amountSpread({ amount: 1000, frequency: 'monthly', fixed: false, range: { low: 300, high: 900 } })).toEqual({
      low: 300,
      typical: 1000,
      high: 1000,
    });
  });

  it('converts every bound to a monthly equivalent', () => {
    const s = monthlySpread({ amount: 2400, frequency: 'yearly', fixed: false, range: { low: 1200, high: 3600 } });
    expect(s).toEqual({ low: 100, typical: 200, high: 300 });
  });

  it('reports whether the cost really varies', () => {
    expect(varies({ amount: 500, frequency: 'monthly', fixed: false })).toBe(false);
    expect(varies({ amount: 500, frequency: 'monthly', fixed: false, range: { low: 500, high: 500 } })).toBe(false);
    expect(varies({ amount: 500, frequency: 'monthly', fixed: false, range: { low: 300, high: 900 } })).toBe(true);
  });
});
