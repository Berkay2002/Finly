/**
 * Per-year parameters for Swedish employment income tax.
 *
 * Adding a year means adding one object here (and regenerating the kommun rates with
 * `npm run tax:kommuner -- <year>`). Nothing in sweden.ts should need to change unless
 * the law changes the *shape* of a rule, not just its numbers.
 *
 * Every schedule is piecewise linear in prisbasbelopp (PBB) multiples, written exactly as
 * Skatteverket prints it in "Teknisk beskrivning SKV 433":
 *   value = constPbb × PBB + slope × (x − fromPbb × PBB)    for x ≤ upToPbb × PBB
 * The last segment is open-ended (its upToPbb is Infinity).
 *
 * Yearly checklist (published by Skatteverket in early December for the coming year):
 *  1. pbb, ibb, skiktgrans, pension fee cap, public service cap, burial fee rate.
 *  2. The grundavdrag / förhöjt grundavdrag / jobbskatteavdrag segments (compare with SKV 433 §6–7).
 *  3. tableFeePoints (the "1,16 procentenheter" used inside the tables).
 *  4. oneOffBands (SKV 433 §10, column 1).
 *  5. Church fee national average (Svenska kyrkan / SCB).
 *  6. Run the tests: the fixture file holds sampled rows from the official tables for that year.
 */

export interface PiecewiseSegment {
  /** Upper bound of this segment, in PBB multiples. Infinity for the last one. */
  upToPbb: number;
  /** Constant term, in PBB multiples. */
  constPbb: number;
  /** Slope applied to (x − fromPbb × PBB). */
  slope: number;
  /** Reference point for the slope, in PBB multiples. */
  fromPbb: number;
}

export interface JobbskatteavdragRule {
  segments: PiecewiseSegment[];
  /** Subtract grundavdraget from the segment value before multiplying (the under-66 formula). */
  subtractGrundavdrag: boolean;
  /** Multiply by the municipal tax rate (the under-66 formula). */
  timesKommunalRate: boolean;
}

export interface SwedishTaxYear {
  year: number;
  /** Prisbasbelopp. Drives grundavdrag and jobbskatteavdrag. */
  pbb: number;
  /** Inkomstbasbelopp. Drives the pension fee cap and public service fee cap. */
  ibb: number;

  /** Beskattningsbar förvärvsinkomst above which state tax applies. */
  skiktgrans: number;
  stateTaxRate: number;
  /** Skatteverket only charges state tax once the base exceeds the threshold by this much. */
  stateTaxMinimumExcess: number;

  grundavdrag: PiecewiseSegment[];
  /** Extra deduction for people who were 66+ at the start of the year, added to grundavdrag. */
  forhojtGrundavdrag: PiecewiseSegment[];
  jobbskatteavdragUnder66: JobbskatteavdragRule;
  jobbskatteavdragOver66: JobbskatteavdragRule;

  /** Begravningsavgift in percent (national rate) and per-kommun exceptions by kommun code. */
  burialFeeRate: number;
  burialFeeExceptions: Record<string, number>;
  /** Kyrkoavgift used when the user is a member and no parish rate is given (national average, %). */
  churchFeeDefaultRate: number;
  /** Fixed percentage points the tables reserve for burial + church fees. */
  tableFeePoints: number;
  /** Used only when neither the profile nor the kommun list gives a rate. */
  fallbackKommunalRate: number;

  pensionFeeRate: number;
  /** Income cap for the pension fee, in IBB multiples. */
  pensionFeeCapIbb: number;
  /** No pension fee below this income, in PBB multiples. */
  pensionFeeFloorPbb: number;

  publicServiceRate: number;
  /** Cap for the public service fee base, in IBB multiples. */
  publicServiceCapIbb: number;

  /** Skattereduktion för förvärvsinkomst. */
  earnedIncomeReduction: { from: number; to: number; rate: number; max: number };

  /** Monthly table rows are `tableRowStepLow` kr wide up to the break, `tableRowStepHigh` above it. */
  tableRowStepBreak: number;
  tableRowStepLow: number;
  tableRowStepHigh: number;

  /** Flat withholding for one-off payments (engångsbelopp), column 1, by annual income band. */
  oneOffBands: { upTo: number; rate: number }[];
}

/**
 * Income year 2026.
 * Sources: Skatteverket "Teknisk beskrivning SKV 433 utgåva 36" (2025-12-10) and
 * "Belopp och procent inkomstår 2026". Verified against the official monthly tables.
 */
export const SWEDEN_2026: SwedishTaxYear = {
  year: 2026,
  pbb: 59_200,
  ibb: 83_400,

  skiktgrans: 643_000,
  stateTaxRate: 0.2,
  stateTaxMinimumExcess: 200,

  // SKV 433 §6.1
  grundavdrag: [
    { upToPbb: 0.99, constPbb: 0.423, slope: 0, fromPbb: 0 },
    { upToPbb: 2.72, constPbb: 0.423, slope: 0.2, fromPbb: 0.99 },
    { upToPbb: 3.11, constPbb: 0.77, slope: 0, fromPbb: 0 },
    { upToPbb: 7.88, constPbb: 0.77, slope: -0.1, fromPbb: 3.11 },
    { upToPbb: Infinity, constPbb: 0.293, slope: 0, fromPbb: 0 },
  ],
  // SKV 433 §6.2
  forhojtGrundavdrag: [
    { upToPbb: 0.91, constPbb: 0.687, slope: 0, fromPbb: 0 },
    { upToPbb: 1.11, constPbb: 0.885, slope: -0.2, fromPbb: 0 },
    { upToPbb: 1.965, constPbb: 0.6, slope: 0.057, fromPbb: 0 },
    { upToPbb: 2.72, constPbb: 0.333, slope: 0.1949, fromPbb: 0 },
    { upToPbb: 3.11, constPbb: -0.212, slope: 0.3949, fromPbb: 0 },
    { upToPbb: 3.24, constPbb: -0.523, slope: 0.4949, fromPbb: 0 },
    { upToPbb: 5.0, constPbb: -0.073, slope: 0.356, fromPbb: 0 },
    { upToPbb: 7.88, constPbb: 0.017, slope: 0.338, fromPbb: 0 },
    { upToPbb: 8.08, constPbb: 0.703, slope: 0.251, fromPbb: 0 },
    { upToPbb: 11.16, constPbb: 2.732, slope: 0, fromPbb: 0 },
    { upToPbb: 12.84, constPbb: 9.651, slope: -0.62, fromPbb: 0 },
    { upToPbb: Infinity, constPbb: 1.691, slope: 0, fromPbb: 0 },
  ],
  // SKV 433 §7.5.2. The 2026 budget removed the phase-out at high incomes.
  jobbskatteavdragUnder66: {
    segments: [
      { upToPbb: 0.91, constPbb: 0, slope: 1, fromPbb: 0 },
      { upToPbb: 3.24, constPbb: 0.91, slope: 0.3874, fromPbb: 0.91 },
      { upToPbb: 8.08, constPbb: 1.813, slope: 0.251, fromPbb: 3.24 },
      { upToPbb: Infinity, constPbb: 3.027, slope: 0, fromPbb: 0 },
    ],
    subtractGrundavdrag: true,
    timesKommunalRate: true,
  },
  jobbskatteavdragOver66: {
    segments: [
      { upToPbb: 1.75, constPbb: 0, slope: 0.22, fromPbb: 0 },
      { upToPbb: 5.24, constPbb: 0.2635, slope: 0.07, fromPbb: 0 },
      { upToPbb: Infinity, constPbb: 0.6293, slope: 0, fromPbb: 0 },
    ],
    subtractGrundavdrag: false,
    timesKommunalRate: false,
  },

  burialFeeRate: 0.292,
  burialFeeExceptions: { '0180': 0.07, '0687': 0.285 }, // Stockholm, Tranås
  churchFeeDefaultRate: 1.03,
  tableFeePoints: 1.16,
  fallbackKommunalRate: 32.38,

  pensionFeeRate: 0.07,
  pensionFeeCapIbb: 8.07,
  pensionFeeFloorPbb: 0.423,

  publicServiceRate: 0.01,
  publicServiceCapIbb: 1.42,

  earnedIncomeReduction: { from: 40_000, to: 240_000, rate: 0.0075, max: 1_500 },

  tableRowStepBreak: 20_000,
  tableRowStepLow: 100,
  tableRowStepHigh: 200,

  // SKV 433 §10, column 1
  oneOffBands: [
    { upTo: 25_041, rate: 0 },
    { upTo: 82_800, rate: 0.1 },
    { upTo: 192_000, rate: 0.21 },
    { upTo: 477_600, rate: 0.26 },
    { upTo: 660_000, rate: 0.34 },
    { upTo: Infinity, rate: 0.54 },
  ],
};

export const SWEDISH_TAX_YEARS: Record<number, SwedishTaxYear> = {
  2026: SWEDEN_2026,
};
