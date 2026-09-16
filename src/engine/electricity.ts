import type { AmountSpread } from './amounts';
import type { ElectricityTariff, ExpenseItem, PriceArea, TariffPart } from './types';

/**
 * Swedish electricity comes as two bills built the same way: a fixed monthly fee plus a price per
 * kWh used. The supplier (elhandel) charges spot price + påslag + månadsavgift; the grid owner
 * (elnät) charges överföringsavgift + energiskatt + abonnemang. Once usage and those prices are
 * known, the bill is a calculation rather than a guess.
 *
 * All tariff prices are entered including 25% moms, the way consumer price lists and invoices
 * show them.
 */

export const VAT_RATE = 0.25;

/** Energiskatt on electricity from 1 January 2026: 36.0 öre/kWh excluding moms, 45 öre including. */
export const ENERGY_TAX_ORE = 45;

/** The same after the 9.6 öre deduction for households in northern Sweden: 26.4 öre excluding moms. */
export const REDUCED_ENERGY_TAX_ORE = 33;

/**
 * Where the deduction applies (lagen om skatt på energi 11 kap.): every kommun in Jämtland (23),
 * Västerbotten (24) and Norrbotten (25), plus these.
 */
const REDUCED_TAX_COUNTIES = new Set(['23', '24', '25']);
const REDUCED_TAX_KOMMUNER = new Set([
  '2283', // Sollefteå
  '2260', // Ånge
  '2284', // Örnsköldsvik
  '2161', // Ljusdal
  '2023', // Malung-Sälen
  '2062', // Mora
  '2034', // Orsa
  '2039', // Älvdalen
  '1737', // Torsby
]);

export function hasReducedEnergyTax(kommunCode: string): boolean {
  return REDUCED_TAX_COUNTIES.has(kommunCode.slice(0, 2)) || REDUCED_TAX_KOMMUNER.has(kommunCode);
}

/** Energiskatt incl. moms for a kommun, or the standard rate when the kommun is unknown. */
export function energyTaxFor(kommunCode: string | undefined): number {
  return kommunCode && hasReducedEnergyTax(kommunCode) ? REDUCED_ENERGY_TAX_ORE : ENERGY_TAX_ORE;
}

/**
 * Price areas are drawn along the transmission grid rather than kommun borders, so a kommun only
 * settles the area when its whole county lies in one. Västerbotten, Gävleborg, Dalarna and the
 * counties along the SE3/SE4 line are split; there the user picks.
 */
const AREA_BY_COUNTY: Record<string, PriceArea> = {
  '25': 'SE1', // Norrbotten
  '23': 'SE2', // Jämtland
  '22': 'SE2', // Västernorrland
  '01': 'SE3', // Stockholm
  '03': 'SE3', // Uppsala
  '04': 'SE3', // Södermanland
  '05': 'SE3', // Östergötland
  '09': 'SE3', // Gotland
  '17': 'SE3', // Värmland
  '18': 'SE3', // Örebro
  '19': 'SE3', // Västmanland
  '07': 'SE4', // Kronoberg
  '10': 'SE4', // Blekinge
  '12': 'SE4', // Skåne
};

export function priceAreaFor(kommunCode: string | undefined): PriceArea | undefined {
  return kommunCode ? AREA_BY_COUNTY[kommunCode.slice(0, 2)] : undefined;
}

/** Subcategories that can be calculated from a tariff, and which half of the bill each one is. */
const TARIFF_PARTS: Record<string, TariffPart> = {
  electricity: 'supply',
  grid_fee: 'grid',
};

export function tariffPartFor(subcategory: string): TariffPart | undefined {
  return TARIFF_PARTS[subcategory];
}

const pos = (n: number | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);

/** Price per kWh in kronor, both per-kWh components together. */
export function perKwh(t: ElectricityTariff): number {
  return (pos(t.energyPrice) + pos(t.surcharge)) / 100;
}

/** Monthly bill in kronor for a given usage. */
export function tariffCost(t: ElectricityTariff, kwh: number): number {
  return pos(t.monthlyFee) + pos(kwh) * perKwh(t);
}

/**
 * Low / typical / high monthly bill. Typical is the average month; the light and heavy months,
 * when given, set the band (a house with electric heating can use three times as much in January
 * as in July). Rounded to whole kronor.
 */
export function tariffSpread(t: ElectricityTariff): AmountSpread {
  const typical = Math.round(tariffCost(t, t.kwh));
  const a = Math.round(tariffCost(t, pos(t.kwhLow) || t.kwh));
  const b = Math.round(tariffCost(t, pos(t.kwhHigh) || t.kwh));
  return {
    low: Math.min(a, b, typical),
    typical,
    high: Math.max(a, b, typical),
  };
}

/**
 * A starting tariff for a new calculation. Usage is shared by both bills, so it is copied from the
 * other half when that has been filled in; energiskatt follows the home kommun.
 */
export function defaultTariff(
  part: TariffPart,
  { sibling, kommunCode }: { sibling?: ElectricityTariff; kommunCode?: string } = {},
): ElectricityTariff {
  return {
    part,
    kwh: sibling?.kwh ?? 0,
    kwhLow: sibling?.kwhLow,
    kwhHigh: sibling?.kwhHigh,
    energyPrice: 0,
    surcharge: part === 'grid' ? energyTaxFor(kommunCode) : 0,
    monthlyFee: 0,
  };
}

/**
 * Writes the calculated figures into the plain amount fields. `amountSpread` already reads the
 * tariff directly; keeping `amount` and `range` in step means anything that looks at them (an older
 * build on another synced device, exported plan files) still sees the right numbers.
 */
export function withTariffAmounts<T extends Pick<ExpenseItem, 'amount' | 'range' | 'fixed' | 'frequency' | 'tariff'>>(
  item: T,
): T {
  if (!item.tariff) return item;
  const s = tariffSpread(item.tariff);
  return {
    ...item,
    amount: s.typical,
    range: s.high > s.low ? { low: s.low, high: s.high } : undefined,
    fixed: false,
    frequency: 'monthly',
  };
}

/**
 * Both bills meter the same kWh. After `sourceId` changes, copy its usage to every other
 * calculated electricity item and recompute their amounts.
 */
export function shareUsage(expenses: ExpenseItem[], sourceId: string): ExpenseItem[] {
  const source = expenses.find((e) => e.id === sourceId)?.tariff;
  if (!source) return expenses;
  return expenses.map((e) => {
    if (e.id === sourceId || !e.tariff) return e;
    const t = e.tariff;
    if (t.kwh === source.kwh && t.kwhLow === source.kwhLow && t.kwhHigh === source.kwhHigh) return e;
    return withTariffAmounts({
      ...e,
      tariff: { ...t, kwh: source.kwh, kwhLow: source.kwhLow, kwhHigh: source.kwhHigh },
    });
  });
}

/** The monthly usage a real bill implies under this tariff, or null when it cannot be worked out. */
export function impliedKwh(t: ElectricityTariff, bill: number): number | null {
  const price = perKwh(t);
  if (price <= 0 || !(bill > 0)) return null;
  const kwh = (bill - pos(t.monthlyFee)) / price;
  return kwh > 0 ? Math.round(kwh / 10) * 10 : null;
}
