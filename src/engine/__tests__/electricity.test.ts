import { describe, expect, it } from 'vitest';
import { amountSpread } from '../amounts';
import { suggestFromActuals } from '../actuals';
import {
  ENERGY_TAX_ORE,
  REDUCED_ENERGY_TAX_ORE,
  defaultTariff,
  energyTaxFor,
  priceAreaFor,
  impliedKwh,
  shareUsage,
  tariffCost,
  tariffPartFor,
  tariffSpread,
  withTariffAmounts,
} from '../electricity';
import type { ElectricityTariff } from '../types';
import { expense } from './fixtures';

const supply: ElectricityTariff = {
  part: 'supply',
  kwh: 400,
  energyPrice: 80, // spot, öre incl. moms
  surcharge: 5, // påslag
  monthlyFee: 49,
  priceArea: 'SE3',
};

const grid: ElectricityTariff = {
  part: 'grid',
  kwh: 400,
  energyPrice: 30, // överföring
  surcharge: ENERGY_TAX_ORE,
  monthlyFee: 330,
};

describe('tariffCost', () => {
  it('adds the monthly fee to usage × both per-kWh prices', () => {
    expect(tariffCost(supply, 400)).toBeCloseTo(49 + 400 * 0.85);
    expect(tariffCost(grid, 400)).toBeCloseTo(330 + 400 * 0.75);
  });

  it('ignores negative or missing numbers', () => {
    expect(tariffCost({ ...supply, monthlyFee: -10, surcharge: NaN }, -5)).toBe(0);
  });
});

describe('tariffSpread', () => {
  it('collapses to the average month when no light or heavy month is given', () => {
    expect(tariffSpread(supply)).toEqual({ low: 389, typical: 389, high: 389 });
  });

  it('prices the light and heavy months for the range', () => {
    expect(tariffSpread({ ...grid, kwhLow: 200, kwhHigh: 900 })).toEqual({ low: 480, typical: 630, high: 1005 });
  });

  it('keeps low ≤ typical ≤ high when the months are entered the wrong way round', () => {
    const s = tariffSpread({ ...grid, kwhLow: 900, kwhHigh: 200 });
    expect(s.low).toBeLessThanOrEqual(s.typical);
    expect(s.high).toBeGreaterThanOrEqual(s.typical);
  });
});

describe('amountSpread with a tariff', () => {
  it('runs on the tariff instead of amount and range', () => {
    const s = amountSpread({ amount: 999, frequency: 'monthly', fixed: false, range: { low: 1, high: 2000 }, tariff: grid });
    expect(s).toEqual({ low: 630, typical: 630, high: 630 });
  });
});

describe('withTariffAmounts', () => {
  it('writes the calculated figures into the plain fields', () => {
    const e = withTariffAmounts(
      expense({ name: 'Elnät', amount: 0, fixed: true, frequency: 'quarterly', tariff: { ...grid, kwhLow: 200, kwhHigh: 900 } }),
    );
    expect(e).toMatchObject({ amount: 630, range: { low: 480, high: 1005 }, fixed: false, frequency: 'monthly' });
  });

  it('leaves items without a tariff alone', () => {
    const e = expense({ name: 'Rent', amount: 7000 });
    expect(withTariffAmounts(e)).toBe(e);
  });
});

describe('shareUsage', () => {
  it('copies usage to the other calculated bill and recomputes it', () => {
    const list = [
      expense({ id: 'el', name: 'Electricity', amount: 0, tariff: { ...supply, kwh: 600, kwhHigh: 1200 } }),
      expense({ id: 'net', name: 'Elnät', amount: 630, tariff: grid }),
      expense({ id: 'rent', name: 'Rent', amount: 7000 }),
    ];
    const out = shareUsage(list, 'el');
    expect(out[1].tariff).toMatchObject({ kwh: 600, kwhHigh: 1200, energyPrice: 30 });
    expect(out[1].amount).toBe(780);
    expect(out[0]).toBe(list[0]);
    expect(out[2]).toBe(list[2]);
  });
});

describe('defaultTariff', () => {
  it('prefills energiskatt for the grid and usage from the other bill', () => {
    const t = defaultTariff('grid', { sibling: { ...supply, kwhLow: 250 } });
    expect(t).toMatchObject({ part: 'grid', kwh: 400, kwhLow: 250, surcharge: ENERGY_TAX_ORE, energyPrice: 0 });
  });

  it('uses the reduced energiskatt for a northern home', () => {
    expect(defaultTariff('grid', { kommunCode: '2480' }).surcharge).toBe(REDUCED_ENERGY_TAX_ORE); // Umeå
    expect(defaultTariff('supply', { kommunCode: '2480' }).surcharge).toBe(0);
  });

  it('maps only electricity and elnät to a tariff part', () => {
    expect(tariffPartFor('electricity')).toBe('supply');
    expect(tariffPartFor('grid_fee')).toBe('grid');
    expect(tariffPartFor('water')).toBeUndefined();
  });
});

describe('impliedKwh', () => {
  it('works usage back out of a bill', () => {
    expect(impliedKwh(grid, 630)).toBe(400);
  });

  it('returns null when there is no per-kWh price or the bill is below the fee', () => {
    expect(impliedKwh({ ...grid, energyPrice: 0, surcharge: 0 }, 630)).toBeNull();
    expect(impliedKwh(grid, 200)).toBeNull();
  });
});

describe('suggestFromActuals with a tariff', () => {
  it('does not offer to overwrite a calculated amount', () => {
    const e = expense({
      name: 'Elnät',
      amount: 630,
      fixed: false,
      tariff: grid,
      actuals: { '2026-06': 900, '2026-07': 950, '2026-08': 1000 },
    });
    expect(suggestFromActuals(e)).toBeNull();
  });
});

describe('a real elnät invoice (E.ON, SE3, 2026)', () => {
  // App: abonnemang 110 kr/month, överföring 109.2 öre, energiskatt 45 öre (all incl. moms).
  // August invoice: 342 kWh → 509.57 kr excl. moms, 637.00 kr to pay. Estimated year: 2,144 kWh → 4,626 kr.
  const eon: ElectricityTariff = { part: 'grid', kwh: 2144 / 12, energyPrice: 109.2, surcharge: 45, monthlyFee: 110 };

  it('matches the invoice to the krona', () => {
    expect(Math.round(tariffCost(eon, 342))).toBe(637);
  });

  it("matches the provider's estimated annual cost", () => {
    expect(Math.round(tariffCost(eon, eon.kwh) * 12)).toBe(4626);
  });
});

describe('location', () => {
  it('knows which kommuner get the energiskatt deduction', () => {
    expect(energyTaxFor('2580')).toBe(REDUCED_ENERGY_TAX_ORE); // Luleå, Norrbotten
    expect(energyTaxFor('2062')).toBe(REDUCED_ENERGY_TAX_ORE); // Mora, named in the law
    expect(energyTaxFor('2281')).toBe(ENERGY_TAX_ORE); // Sundsvall, same county as Örnsköldsvik but not listed
    expect(energyTaxFor('0581')).toBe(ENERGY_TAX_ORE); // Norrköping
    expect(energyTaxFor(undefined)).toBe(ENERGY_TAX_ORE);
  });

  it('only names a price area where the whole county lies in one', () => {
    expect(priceAreaFor('0581')).toBe('SE3'); // Norrköping
    expect(priceAreaFor('1280')).toBe('SE4'); // Malmö
    expect(priceAreaFor('2580')).toBe('SE1'); // Luleå
    expect(priceAreaFor('2180')).toBeUndefined(); // Gävle, Gävleborg is split
    expect(priceAreaFor('1480')).toBeUndefined(); // Göteborg, Västra Götaland is split
  });
});
