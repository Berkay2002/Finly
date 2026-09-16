/**
 * Swedish income tax on employment income, modelled the way payroll withholds it.
 *
 * Employers deduct preliminary tax each month from Skatteverket's "skattetabeller".
 * A table row is computed by annualising the monthly salary (× 12), working out a
 * full year's tax with grundavdrag and jobbskatteavdrag applied in full, and dividing
 * by 12. Nothing carries over between months, which is why a person who starts mid-year
 * gets the same net figure as someone who worked all year. Any difference is settled
 * the following year via the tax return, not on the payslip.
 *
 * Everything that changes from year to year (base amounts, thresholds, every piecewise
 * coefficient, fee rates) lives in a `SwedishTaxYear` object in ./years. This file only
 * holds the mechanics, which have been stable across years: the order of reductions,
 * the caps and the rounding rules from SKV 433.
 *
 * Verified against every row of Skatteverket's official 2026 monthly tables 29–42
 * (columns 1 and 3) to within 1 kr. See __tests__/tax-sweden.test.ts.
 */

import { kommunerFor, NATIONAL_AVERAGE_RATE } from './kommuner';
import type { SwedishTaxProfile } from '../types';
import { SWEDISH_TAX_YEARS, type PiecewiseSegment, type SwedishTaxYear } from './years';

export type { SwedishTaxYear } from './years';
export { SWEDISH_TAX_YEARS } from './years';

/* ------------------------------------------------------------------ */
/* Year resolution                                                     */
/* ------------------------------------------------------------------ */

/** Latest tax year we have parameters for, at or before the given year. */
export function resolveTaxYear(year: number = new Date().getFullYear()): SwedishTaxYear {
  const years = Object.keys(SWEDISH_TAX_YEARS)
    .map(Number)
    .sort((a, b) => b - a);
  return SWEDISH_TAX_YEARS[years.find((y) => y <= year) ?? years[years.length - 1]];
}

/** True when no parameters exist for the given calendar year and an older year's rules are being used. */
export function isTaxYearStale(year: number = new Date().getFullYear()): boolean {
  return resolveTaxYear(year).year !== year;
}

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

/**
 * What we need to know about a person to withhold tax the way their employer does.
 *
 * - kommunCode: four-digit kommun code. Undefined means "use the national average".
 * - kommunalRate: total kommun + region rate in percent, copied from the kommun list at save time
 *   so a stored plan keeps its numbers if the list is regenerated. Overrides the lookup if set.
 * - churchMember / churchRate: member of Svenska kyrkan (or another trossamfund collecting via tax);
 *   parish rate in percent, defaulting to the year's national average.
 * - over66: turned 66 before the start of the income year → förhöjt grundavdrag and the 66+ jobbskatteavdrag.
 */
export type { SwedishTaxProfile } from '../types';

export const DEFAULT_TAX_PROFILE: SwedishTaxProfile = { churchMember: false, over66: false };

/* ------------------------------------------------------------------ */
/* Rounding helpers (Skatteverket's rules)                             */
/* ------------------------------------------------------------------ */

const EPS = 1e-9;
const floorKr = (v: number) => Math.floor(v + EPS);
const ceilTo = (v: number, step: number) => Math.ceil(v / step - EPS) * step;
const floorTo = (v: number, step: number) => Math.floor(v / step + EPS) * step;
/** Round to nearest 100, with an exact 50 rounding down (pension fee rule). */
const roundPensionFee = (v: number) => {
  const rem = v % 100;
  return rem > 50 + EPS ? floorTo(v, 100) + 100 : floorTo(v, 100);
};

/** Evaluate a piecewise-linear schedule expressed in prisbasbelopp multiples. */
function piecewise(segments: PiecewiseSegment[], x: number, pbb: number): number {
  const seg = segments.find((s) => x <= s.upToPbb * pbb) ?? segments[segments.length - 1];
  return seg.constPbb * pbb + seg.slope * (x - seg.fromPbb * pbb);
}

/* ------------------------------------------------------------------ */
/* Components                                                          */
/* ------------------------------------------------------------------ */

/**
 * Grundavdrag for a fastställd förvärvsinkomst (annual). Rounded up to whole hundreds
 * and never larger than the income itself. Includes the förhöjt grundavdrag for 66+.
 */
export function grundavdrag(ffi: number, over66: boolean, y: SwedishTaxYear): number {
  if (ffi <= 0) return 0;
  const raw = piecewise(y.grundavdrag, ffi, y.pbb) + (over66 ? piecewise(y.forhojtGrundavdrag, ffi, y.pbb) : 0);
  return Math.min(ceilTo(raw, 100), ffi);
}

/**
 * Jobbskatteavdrag (skattereduktion för arbetsinkomst) before capping against municipal tax.
 * `kommunalRate` is the rate in percent excluding burial/church fee points.
 */
export function jobbskatteavdrag(
  arbetsinkomst: number,
  ga: number,
  kommunalRate: number,
  over66: boolean,
  y: SwedishTaxYear,
): number {
  const ai = floorTo(arbetsinkomst, 100);
  const rule = over66 ? y.jobbskatteavdragOver66 : y.jobbskatteavdragUnder66;
  let r = piecewise(rule.segments, ai, y.pbb);
  if (rule.subtractGrundavdrag) r -= ga;
  if (rule.timesKommunalRate) r *= kommunalRate / 100;
  return Math.max(0, floorKr(r));
}

export function allmanPensionsavgift(ffi: number, y: SwedishTaxYear): number {
  if (ffi < y.pensionFeeFloorPbb * y.pbb) return 0;
  const base = Math.min(ffi, y.pensionFeeCapIbb * y.ibb);
  return roundPensionFee(base * y.pensionFeeRate);
}

export function publicServiceAvgift(bfi: number, y: SwedishTaxYear): number {
  const cap = y.publicServiceCapIbb * y.ibb;
  return floorKr(Math.min(bfi, cap) * y.publicServiceRate);
}

export function forvarvsinkomstReduktion(bfi: number, y: SwedishTaxYear): number {
  const { from, to, rate, max } = y.earnedIncomeReduction;
  if (bfi <= from) return 0;
  if (bfi > to) return max;
  return Math.min(max, floorKr((bfi - from) * rate));
}

export function statligSkatt(bfi: number, y: SwedishTaxYear): number {
  if (bfi < y.skiktgrans + y.stateTaxMinimumExcess) return 0;
  return floorKr((bfi - y.skiktgrans) * y.stateTaxRate);
}

/* ------------------------------------------------------------------ */
/* Rates                                                               */
/* ------------------------------------------------------------------ */

export interface ResolvedRates {
  kommunalRate: number;
  burialRate: number;
  churchRate: number;
  /** kommunal + burial + church, unrounded. */
  totalRate: number;
  /** The whole-number skattetabell the employer would use (29–42 in practice). */
  tableNumber: number;
}

export function resolveRates(profile: SwedishTaxProfile, y: SwedishTaxYear): ResolvedRates {
  const kommun = kommunerFor(y.year).find((k) => k.code === profile.kommunCode);
  const kommunalRate = profile.kommunalRate ?? kommun?.rate ?? NATIONAL_AVERAGE_RATE[y.year] ?? y.fallbackKommunalRate;
  const burialRate = (profile.kommunCode && y.burialFeeExceptions[profile.kommunCode]) || y.burialFeeRate;
  const churchRate = profile.churchMember ? (profile.churchRate ?? y.churchFeeDefaultRate) : 0;
  const totalRate = kommunalRate + burialRate + churchRate;
  return { kommunalRate, burialRate, churchRate, totalRate, tableNumber: Math.round(totalRate) };
}

/* ------------------------------------------------------------------ */
/* Annual and monthly calculations                                     */
/* ------------------------------------------------------------------ */

export interface AnnualTaxBreakdown {
  annualGross: number;
  grundavdrag: number;
  taxableIncome: number;
  kommunalSkatt: number;
  statligSkatt: number;
  pensionsavgift: number;
  /** Reductions actually used (already capped). */
  pensionsavgiftReduktion: number;
  jobbskatteavdrag: number;
  forvarvsinkomstReduktion: number;
  /** Begravningsavgift + kyrkoavgift. */
  fees: number;
  publicService: number;
  totalTax: number;
  annualNet: number;
  effectiveRate: number;
}

/**
 * Full-year tax for an annual employment income, following the column-1 (under 66) or
 * column-3 (66+, wage income) composition in SKV 433 §8.
 *
 * `tableMode` reproduces the withholding table: the fee part is the fixed table fee points and
 * the municipal rate is the whole-number table minus those points. Off, it uses the exact rates,
 * which is closer to the final tax bill but a few kronor away from the payslip.
 */
export function computeAnnualTax(
  annualGross: number,
  profile: SwedishTaxProfile,
  y: SwedishTaxYear,
  tableMode = true,
): AnnualTaxBreakdown {
  const ffi = Math.max(0, annualGross);
  const rates = resolveRates(profile, y);
  const feePoints = tableMode ? y.tableFeePoints : rates.burialRate + rates.churchRate;
  const kommunalRate = tableMode ? rates.tableNumber - y.tableFeePoints : rates.kommunalRate;

  const ga = grundavdrag(ffi, profile.over66, y);
  const bfi = Math.max(0, ffi - ga);

  const kommunal = floorKr((bfi * kommunalRate) / 100);
  const statlig = statligSkatt(bfi, y);
  const pension = allmanPensionsavgift(ffi, y);

  // Reductions in the order Skatteverket applies them. The pension fee reduction counts against
  // state + municipal tax; the other two only against what is left of municipal tax.
  const pensionRed = Math.min(pension, statlig + kommunal);
  let kommunalLeft = Math.max(0, kommunal - pensionRed);
  const jsa = Math.min(jobbskatteavdrag(ffi, ga, kommunalRate, profile.over66, y), kommunalLeft);
  kommunalLeft -= jsa;
  const fiRed = Math.min(forvarvsinkomstReduktion(bfi, y), kommunalLeft);

  const fees = floorKr((bfi * feePoints) / 100);
  const ps = publicServiceAvgift(bfi, y);

  const totalTax = statlig + kommunal - pensionRed - jsa - fiRed + fees + pension + ps;
  return {
    annualGross: ffi,
    grundavdrag: ga,
    taxableIncome: bfi,
    kommunalSkatt: kommunal,
    statligSkatt: statlig,
    pensionsavgift: pension,
    pensionsavgiftReduktion: pensionRed,
    jobbskatteavdrag: jsa,
    forvarvsinkomstReduktion: fiRed,
    fees,
    publicService: ps,
    totalTax,
    annualNet: ffi - totalTax,
    effectiveRate: ffi > 0 ? totalTax / ffi : 0,
  };
}

export interface MonthlyWithholding {
  grossMonthly: number;
  /** Preliminary tax deducted, as the skattetabell would show it. */
  tax: number;
  netMonthly: number;
  effectiveRate: number;
  tableNumber: number;
  /** 1 for under 66, 3 for 66+ with wage income. */
  column: 1 | 3;
  taxYear: number;
  annual: AnnualTaxBreakdown;
}

/**
 * Monthly withholding for a monthly gross salary, matching the skattetabell row the
 * employer reads. Table rows are 100 kr wide up to the first break and 200 kr above it,
 * and the row's tax is computed from the top of the interval.
 */
export function monthlyWithholding(
  grossMonthly: number,
  profile: SwedishTaxProfile,
  y: SwedishTaxYear = resolveTaxYear(),
): MonthlyWithholding {
  const gross = Number.isFinite(grossMonthly) && grossMonthly > 0 ? grossMonthly : 0;
  const step = gross <= y.tableRowStepBreak ? y.tableRowStepLow : y.tableRowStepHigh;
  const rowTop = ceilTo(gross, step);
  const annual = computeAnnualTax(rowTop * 12, profile, y, true);
  const tax = floorKr(annual.totalTax / 12);
  const rates = resolveRates(profile, y);
  return {
    grossMonthly: gross,
    tax,
    netMonthly: gross - tax,
    effectiveRate: gross > 0 ? tax / gross : 0,
    tableNumber: rates.tableNumber,
    column: profile.over66 ? 3 : 1,
    taxYear: y.year,
    annual,
  };
}

/** Convenience: net monthly salary from gross monthly salary. */
export function netFromGrossMonthly(grossMonthly: number, profile: SwedishTaxProfile, y?: SwedishTaxYear): number {
  return monthlyWithholding(grossMonthly, profile, y).netMonthly;
}

/**
 * Flat withholding rate for a one-off payment such as a bonus (engångsbelopp), column 1.
 * `annualIncome` is the person's expected total yearly income including the payment.
 */
export function oneOffWithholdingRate(annualIncome: number, y: SwedishTaxYear = resolveTaxYear()): number {
  return y.oneOffBands.find((b) => annualIncome <= b.upTo)?.rate ?? y.oneOffBands[y.oneOffBands.length - 1].rate;
}
