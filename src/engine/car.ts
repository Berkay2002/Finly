import { energyTaxFor, perKwh } from './electricity';
import { homeKommunCode } from './home';
import { monthKeyOf } from './metrics';
import type { FinancialPlan } from './types';

/**
 * What owning a car costs a month, and how much car a plan can carry. There is no free register
 * lookup by plate in Sweden (Transportstyrelsen sells register access to businesses only), so the
 * car's figures come from the ad or the registration certificate; the vehicle tax is then exact.
 */

/** `hybrid` is a plug-in hybrid; `petrol_hybrid` is a self-charging one (elhybrid), taxed and fuelled like petrol. */
export type CarFuel = 'petrol' | 'petrol_hybrid' | 'hybrid' | 'diesel' | 'electric' | 'ethanol';
export const CAR_FUELS: CarFuel[] = ['petrol', 'petrol_hybrid', 'hybrid', 'diesel', 'electric', 'ethanol'];

export interface CarDetails {
  fuel: CarFuel;
  /** Mixed-driving CO2, g/km. A plug-in hybrid uses its weighted figure. */
  co2: number;
  /** YYYY-MM the car was first registered (i trafik första gången). */
  firstRegistered: string;
}

/* ------------------------------------------------------------------ */
/* Vehicle tax (fordonsskatt)                                          */
/* ------------------------------------------------------------------ */

const BASE = 360;
/** Above this many g/km each gram costs 22 kr, or 11 kr for a car that runs on ethanol. */
const CO2_FREE = 111;
const MALUS_YEARS = 3;
/** Malus rates by first registration: kr/g from `low` g/km, and a higher rate above `high` g/km. */
const MALUS_BANDS = [
  { from: '2022-06', low: 75, high: 125, lowRate: 107, highRate: 132 },
  { from: '2021-04', low: 90, high: 130, lowRate: 107, highRate: 132 },
  { from: '2018-07', low: 95, high: 140, lowRate: 82, highRate: 107 },
];
/** Diesel from 1 July 2018 pays a fuel surcharge per gram of CO2 and a flat environmental surcharge. */
const DIESEL_FUEL_FACTOR = 13.52;
/** Older diesels multiply the whole tax instead. */
const DIESEL_OLD_FACTOR = 2.37;

const over = (co2: number, from: number) => Math.max(0, co2 - from);

function addMonthsKey(key: string, months: number): string {
  const [y, m] = key.split('-').map(Number);
  return monthKeyOf(new Date(y, m - 1 + months, 1));
}

export interface VehicleTax {
  yearly: number;
  /** YYYY-MM the higher malus tax ends, when it applies at `at`. */
  malusUntil?: string;
  /** The yearly tax once malus has ended. */
  afterMalus?: number;
}

/**
 * Yearly vehicle tax for a passenger car at `at`, per Transportstyrelsen's rules (skattens storlek,
 * malus). Cars from before model year 2006 without the 2005 environmental class are taxed on weight;
 * that case is not covered.
 */
export function vehicleTax(car: CarDetails, at: Date): VehicleTax {
  const reg = car.firstRegistered;
  const co2 = car.fuel === 'electric' ? 0 : Math.max(0, car.co2 || 0);
  const diesel = car.fuel === 'diesel';
  if (diesel && reg < '2018-07') {
    return { yearly: Math.round((BASE + 22 * over(co2, CO2_FREE)) * DIESEL_OLD_FACTOR + (Number(reg.slice(0, 4)) >= 2008 ? 250 : 500)) };
  }
  const dieselExtra = diesel ? 250 + DIESEL_FUEL_FACTOR * co2 : 0;
  const normal = BASE + (car.fuel === 'ethanol' ? 11 : 22) * over(co2, CO2_FREE) + dieselExtra;
  const band = MALUS_BANDS.find((b) => reg >= b.from);
  const exempt = car.fuel === 'electric' || (car.fuel === 'ethanol' && reg < '2025-02');
  const malusUntil = addMonthsKey(reg, MALUS_YEARS * 12);
  if (!band || exempt || monthKeyOf(at) >= malusUntil) return { yearly: Math.round(normal) };
  const malus =
    band.lowRate * (Math.min(co2, band.high) - Math.min(co2, band.low)) + band.highRate * over(co2, band.high);
  return { yearly: Math.round(BASE + malus + dieselExtra), malusUntil, afterMalus: Math.round(normal) };
}

/* ------------------------------------------------------------------ */
/* Running costs                                                       */
/* ------------------------------------------------------------------ */

export interface RunningInput {
  taxYearly: number;
  kmPerYear: number;
  /** Litres or kWh per 100 km. */
  consumption: number;
  /** Kronor per litre or kWh. */
  unitPrice: number;
  insuranceMonthly: number;
  serviceYearly: number;
  parkingMonthly: number;
}

export interface RunningCosts {
  tax: number;
  energy: number;
  insurance: number;
  service: number;
  parking: number;
  total: number;
}

const pos = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

/** Monthly running costs. A plug-in hybrid's electricity is not split out; its consumption is taken as fuel. */
export function runningCosts(i: RunningInput): RunningCosts {
  const tax = pos(i.taxYearly) / 12;
  const energy = (pos(i.kmPerYear) * pos(i.consumption) * pos(i.unitPrice)) / 100 / 12;
  const insurance = pos(i.insuranceMonthly);
  const service = pos(i.serviceYearly) / 12;
  const parking = pos(i.parkingMonthly);
  return { tax, energy, insurance, service, parking, total: tax + energy + insurance + service + parking };
}

export interface ChargingPrice {
  krPerKwh: number;
  /** `tariff`: the household's own electricity bills; `spot`: spot price plus energy tax, without supplier markup or grid fee. */
  source: 'tariff' | 'spot';
}

/** Electricity at home (charging a car, running a house): the plan's own supply and grid tariffs when both are entered, else the spot average (öre incl. moms) plus energy tax. */
export function homeElectricityPrice(plan: FinancialPlan, spotOreInclVat?: number): ChargingPrice | null {
  const tariffs = plan.expenses.map((e) => e.tariff).filter((t) => t !== undefined);
  const supply = tariffs.find((t) => t.part === 'supply');
  const grid = tariffs.find((t) => t.part === 'grid');
  if (supply && grid && perKwh(supply) > 0) return { krPerKwh: perKwh(supply) + perKwh(grid), source: 'tariff' };
  if (spotOreInclVat === undefined) return null;
  return { krPerKwh: (spotOreInclVat + energyTaxFor(homeKommunCode(plan))) / 100, source: 'spot' };
}

/* ------------------------------------------------------------------ */
/* Estimates for what the ad does not say                              */
/* ------------------------------------------------------------------ */

/**
 * car.info shows a car's CO2, fuel use, first registration and vehicle tax by plate, free. Transportstyrelsen's
 * own lookup sits behind a captcha and leaves out CO2.
 */
export function carInfoUrl(plate: string): string {
  const reg = plate.replace(/\s+/g, '').toUpperCase();
  return reg ? `https://www.car.info/sv-se/license-plate/S/${encodeURIComponent(reg)}` : 'https://www.car.info/sv-se/';
}

/** Typical mixed driving per 100 km: litres, or kWh for an electric car. A plug-in hybrid charged most days burns little petrol. */
export const TYPICAL_CONSUMPTION: Record<CarFuel, number> = {
  petrol: 6.5,
  petrol_hybrid: 4.8,
  hybrid: 2.5,
  diesel: 5.5,
  electric: 17,
  ethanol: 9,
};

/** The month `AVERAGE_FUEL_PRICE` was read. */
export const FUEL_PRICES_MONTH = '2026-09';
/**
 * Average pump price across Sweden, kr per litre. Chains no longer publish list prices, and a krona either way
 * moves the monthly cost little, so an average stands in until the user types their own.
 */
// ponytail: static snapshot; fetch it when an open fuel-price source turns up.
export const AVERAGE_FUEL_PRICE: Record<Exclude<CarFuel, 'electric'>, number> = {
  petrol: 17.6,
  petrol_hybrid: 17.6,
  hybrid: 17.6,
  diesel: 21.26,
  ethanol: 14.92,
};

export interface Maintenance {
  service: number;
  tyres: number;
  repairs: number;
  yearly: number;
}

const hundreds = (n: number) => Math.round(n / 100) * 100;

/**
 * A yearly amount to set aside for service, tyres and repairs, since nobody knows it ahead: one service a year
 * (3,000–6,000 kr, less for an electric car), a tyre change twice a year plus new tyres spread over their life
 * (a set lasts about 45,000 km), and repairs once the warranty years are over, more for an older car. An unknown
 * registration counts as a car past its warranty. A buffer, not a quote.
 */
export function maintenanceEstimate({ fuel, firstRegistered, kmPerYear }: { fuel: CarFuel; firstRegistered?: string; kmPerYear: number }, at: Date): Maintenance {
  const [y, m] = (firstRegistered ?? '').split('-').map(Number);
  const age = y && m ? (at.getFullYear() - y) + (at.getMonth() + 1 - m) / 12 : 5;
  const service = fuel === 'electric' ? 2500 : 4500;
  const tyres = hundreds(1200 + (9000 * pos(kmPerYear)) / 45000);
  const repairs = age < 3 ? 0 : age < 8 ? 3000 : 7000;
  return { service, tyres, repairs, yearly: service + tyres + repairs };
}
