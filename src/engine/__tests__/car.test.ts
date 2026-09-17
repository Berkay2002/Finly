import { describe, expect, it } from 'vitest';
import { homeChargingPrice, runningCosts, vehicleTax } from '../car';
import { NOW, prdExamplePlan } from './fixtures';

describe('vehicleTax', () => {
  it('charges the base amount plus 22 kr per gram above 111 g/km', () => {
    expect(vehicleTax({ fuel: 'petrol', co2: 131, firstRegistered: '2015-05' }, NOW).yearly).toBe(360 + 22 * 20);
    expect(vehicleTax({ fuel: 'petrol', co2: 100, firstRegistered: '2015-05' }, NOW).yearly).toBe(360);
  });

  it('charges 11 kr per gram for an ethanol car', () => {
    expect(vehicleTax({ fuel: 'ethanol', co2: 131, firstRegistered: '2015-05' }, NOW).yearly).toBe(360 + 11 * 20);
  });

  it('adds malus for the first three years, then drops to the normal tax', () => {
    const car = { fuel: 'petrol' as const, co2: 150, firstRegistered: '2024-03' };
    const t = vehicleTax(car, NOW);
    expect(t.yearly).toBe(360 + 107 * (125 - 75) + 132 * (150 - 125));
    expect(t.malusUntil).toBe('2027-03');
    expect(t.afterMalus).toBe(360 + 22 * (150 - 111));
    expect(vehicleTax(car, new Date(2027, 2, 1)).yearly).toBe(t.afterMalus);
  });

  it('uses the malus band of the registration date', () => {
    expect(vehicleTax({ fuel: 'petrol', co2: 120, firstRegistered: '2021-05' }, new Date(2022, 0, 1)).yearly).toBe(360 + 107 * 30);
    expect(vehicleTax({ fuel: 'petrol', co2: 150, firstRegistered: '2019-01' }, new Date(2020, 0, 1)).yearly).toBe(360 + 82 * 45 + 107 * 10);
  });

  it('adds the fuel and environmental surcharges for diesel', () => {
    expect(vehicleTax({ fuel: 'diesel', co2: 120, firstRegistered: '2019-01' }, NOW).yearly).toBe(Math.round(360 + 22 * 9 + 250 + 13.52 * 120));
    expect(vehicleTax({ fuel: 'diesel', co2: 120, firstRegistered: '2012-01' }, NOW).yearly).toBe(Math.round((360 + 22 * 9) * 2.37 + 250));
  });

  it('charges only the base amount for an electric car, without malus', () => {
    expect(vehicleTax({ fuel: 'electric', co2: 0, firstRegistered: '2026-01' }, NOW)).toEqual({ yearly: 360 });
  });
});

describe('runningCosts', () => {
  it('adds up a month of tax, fuel, insurance, service and parking', () => {
    const r = runningCosts({ taxYearly: 1200, kmPerYear: 12000, consumption: 6, unitPrice: 17, insuranceMonthly: 500, serviceYearly: 6000, parkingMonthly: 0 });
    expect(r.tax).toBe(100);
    expect(r.energy).toBeCloseTo(1020, 6);
    expect(r.total).toBeCloseTo(100 + 1020 + 500 + 500, 6);
  });
});

describe('homeChargingPrice', () => {
  it('falls back to spot price plus energy tax without tariffs', () => {
    expect(homeChargingPrice(prdExamplePlan(), 80)).toEqual({ krPerKwh: 1.25, source: 'spot' });
    expect(homeChargingPrice(prdExamplePlan())).toBeNull();
  });
});
