import { describe, expect, it } from 'vitest';
import { ownershipMonthly, phonePlanComparison, tripCost } from '../purchases';

describe('tripCost', () => {
  it('adds travel per person, stay per night and food per person per day, converted, plus a buffer', () => {
    const t = tripCost({
      travellers: 2,
      nights: 6,
      travelPerPerson: 3000,
      stayPerNight: 100,
      foodPerPersonDay: 40,
      localTransport: 50,
      activities: 150,
      spending: 0,
      insurance: 0,
      bufferPercent: 10,
      fx: 11,
    });
    expect(t.days).toBe(7);
    expect(t.travel).toBe(6000);
    expect(t.stay).toBe(6600);
    expect(t.food).toBe(40 * 2 * 7 * 11);
    const sub = 6000 + 6600 + 6160 + 550 + 1650;
    expect(t.total).toBeCloseTo(sub * 1.1, 6);
    expect(t.perPerson).toBeCloseTo(t.total / 2, 6);
  });
});

describe('ownershipMonthly', () => {
  it('spreads price less resale over the years kept, plus running costs', () => {
    expect(ownershipMonthly({ price: 25_000, extras: 1000, tradeIn: 2000, resale: 6000, years: 3, running: 50 })).toBe(18_000 / 36 + 50);
  });
});

describe('phonePlanComparison', () => {
  it('compares buying with a SIM-only plan against a plan with the phone', () => {
    const c = phonePlanComparison({ price: 12_000, simOnlyMonthly: 200, bundledMonthly: 650, months: 24 });
    expect(c.buy).toBe(16_800);
    expect(c.bundle).toBe(15_600);
    expect(c.cheaper).toBe('bundle');
    expect(c.difference).toBe(1200);
  });
});
