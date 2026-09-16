/**
 * Kommun tax rate lists, one generated file per income year.
 *
 * To add a year: run `npm run tax:kommuner -- <year>` (see scripts/fetch-kommuner.mjs), then
 * import the new file here and add it to both maps.
 */

import { KOMMUNER_2026, NATIONAL_AVERAGE_RATE_2026 } from './kommuner-2026';

export interface Kommun {
  /** Four-digit SCB/Skatteverket kommun code, e.g. "0180" for Stockholm. */
  code: string;
  name: string;
  /** County (län) name without the "län" suffix. */
  county: string;
  /** Combined kommun + region rate in percent for the income year. */
  rate: number;
}

const KOMMUNER_BY_YEAR: Record<number, Kommun[]> = {
  2026: KOMMUNER_2026,
};

/** "Riket" average total municipal rate per year, in percent. */
export const NATIONAL_AVERAGE_RATE: Record<number, number> = {
  2026: NATIONAL_AVERAGE_RATE_2026,
};

const collator = new Intl.Collator('sv');

/** Kommun list for the latest year at or before `year`, sorted by Swedish alphabetical order. */
export function kommunerFor(year: number): Kommun[] {
  const years = Object.keys(KOMMUNER_BY_YEAR)
    .map(Number)
    .sort((a, b) => b - a);
  const pick = years.find((y) => y <= year) ?? years[years.length - 1];
  return [...KOMMUNER_BY_YEAR[pick]].sort((a, b) => collator.compare(a.name, b.name));
}

export function findKommun(code: string | undefined, year: number): Kommun | undefined {
  return code ? kommunerFor(year).find((k) => k.code === code) : undefined;
}
