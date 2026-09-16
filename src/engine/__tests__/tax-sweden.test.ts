import { describe, expect, it } from 'vitest';
import {
  allmanPensionsavgift,
  computeAnnualTax,
  forvarvsinkomstReduktion,
  grundavdrag,
  isTaxYearStale,
  jobbskatteavdrag,
  monthlyWithholding,
  oneOffWithholdingRate,
  publicServiceAvgift,
  resolveRates,
  resolveTaxYear,
  statligSkatt,
} from '../tax/sweden';
import { SWEDEN_2026 } from '../tax/years';
import { kommunerFor } from '../tax/kommuner';
import { SKATTETABELL_2026 } from './fixtures/skattetabell-2026';

const Y = SWEDEN_2026;
const under66 = { churchMember: false, over66: false };

/**
 * A profile whose rounded table number is exactly `table`, so we can compare with official rows.
 * The table number is round(kommunal + burial + church), so back out the burial fee.
 */
const tableProfile = (table: number) => ({ ...under66, kommunalRate: table - Y.burialFeeRate });

describe('grundavdrag (SKV 433 §6, worked examples)', () => {
  it('matches the published examples', () => {
    expect(grundavdrag(120_000, false, Y)).toBe(37_400);
    expect(grundavdrag(324_000, false, Y)).toBe(31_600);
  });

  it('spans the published range for under 66', () => {
    expect(grundavdrag(50_000, false, Y)).toBe(25_100);
    expect(grundavdrag(170_000, false, Y)).toBe(45_600);
    expect(grundavdrag(800_000, false, Y)).toBe(17_400);
  });

  it('spans the published range for 66+', () => {
    expect(grundavdrag(50_000, true, Y)).toBe(50_000); // capped at the income itself
    expect(grundavdrag(65_800, true, Y)).toBe(65_800); // the published minimum
    expect(grundavdrag(500_000, true, Y)).toBe(179_100);
    expect(grundavdrag(900_000, true, Y)).toBe(117_500);
  });

  it('never exceeds the income', () => {
    expect(grundavdrag(10_000, false, Y)).toBe(10_000);
    expect(grundavdrag(0, false, Y)).toBe(0);
  });
});

describe('jobbskatteavdrag (SKV 433 §7.5.2, worked examples with table 34)', () => {
  const ki = 34 - 1.16;
  it('matches example 1 (90 000 kr)', () => {
    expect(jobbskatteavdrag(90_000, grundavdrag(90_000, false, Y), ki, false, Y)).toBe(11_976);
  });
  it('matches example 2 (240 000 kr)', () => {
    expect(jobbskatteavdrag(240_000, grundavdrag(240_000, false, Y), ki, false, Y)).toBe(26_083);
  });
  it('plateaus above 8.08 PBB (no phase-out in 2026)', () => {
    const at600k = jobbskatteavdrag(600_000, grundavdrag(600_000, false, Y), ki, false, Y);
    const at1m = jobbskatteavdrag(1_000_000, grundavdrag(1_000_000, false, Y), ki, false, Y);
    expect(at1m).toBe(at600k);
  });
  it('uses the flat 66+ schedule', () => {
    expect(jobbskatteavdrag(100_000, 0, ki, true, Y)).toBe(22_000);
    expect(jobbskatteavdrag(400_000, 0, ki, true, Y)).toBe(Math.floor(0.6293 * Y.pbb));
  });
});

describe('fees and reductions', () => {
  it('allmän pensionsavgift rounds to hundreds and caps', () => {
    expect(allmanPensionsavgift(181_200, Y)).toBe(12_700);
    expect(allmanPensionsavgift(20_000, Y)).toBe(0);
    expect(allmanPensionsavgift(1_000_000, Y)).toBe(47_100);
  });
  it('public service fee is 1 % up to the cap', () => {
    expect(publicServiceAvgift(100_000, Y)).toBe(1_000);
    expect(publicServiceAvgift(175_000, Y)).toBe(1_184);
  });
  it('skattereduktion för förvärvsinkomst', () => {
    expect(forvarvsinkomstReduktion(200_000, Y)).toBe(1_200);
    expect(forvarvsinkomstReduktion(400_000, Y)).toBe(1_500);
    expect(forvarvsinkomstReduktion(30_000, Y)).toBe(0);
  });
  it('state tax is 20 % above the threshold', () => {
    expect(statligSkatt(695_000, Y)).toBe(10_400);
    expect(statligSkatt(643_100, Y)).toBe(0);
  });
});

describe('computeAnnualTax (SKV 433 §7.5.2 low-income examples, table 34)', () => {
  it('28 000 kr: reductions cannot eat the fees', () => {
    expect(computeAnnualTax(28_000, tableProfile(34), Y).totalTax).toBe(2_062);
  });
  it('55 000 kr: jobbskatteavdrag is capped by remaining municipal tax', () => {
    const r = computeAnnualTax(55_000, tableProfile(34), Y);
    expect(r.jobbskatteavdrag).toBe(6_019);
    expect(r.totalTax).toBe(4_445);
  });
});

describe('monthlyWithholding vs Skatteverket official 2026 tables', () => {
  it('reproduces every sampled row of tables 29–42, columns 1 and 3, within 1 kr', () => {
    let worst = 0;
    for (const [table, from, to, col1, col3] of SKATTETABELL_2026) {
      for (const income of [from, to]) {
        const c1 = monthlyWithholding(income, tableProfile(table), Y).tax;
        const c3 = monthlyWithholding(income, { ...tableProfile(table), over66: true }, Y).tax;
        worst = Math.max(worst, Math.abs(c1 - col1), Math.abs(c3 - col3));
      }
    }
    expect(worst).toBeLessThanOrEqual(1);
  });

  it('gives a plausible net for a typical Stockholm salary', () => {
    const w = monthlyWithholding(40_000, { ...under66, kommunCode: '0180' }, Y);
    expect(w.tableNumber).toBe(31); // 30.55 + 0.07 burial fee → 30.62 → table 31
    expect(w.column).toBe(1);
    expect(w.netMonthly).toBe(40_000 - w.tax);
    expect(w.effectiveRate).toBeGreaterThan(0.18);
    expect(w.effectiveRate).toBeLessThan(0.22);
  });

  it('church membership moves the table up', () => {
    const noChurch = resolveRates({ ...under66, kommunCode: '1480' }, Y); // Göteborg 32.60
    const church = resolveRates({ ...under66, kommunCode: '1480', churchMember: true }, Y);
    expect(church.totalRate).toBeCloseTo(noChurch.totalRate + Y.churchFeeDefaultRate, 5);
    expect(church.tableNumber).toBe(34);
  });

  it('is safe on nonsense input', () => {
    expect(monthlyWithholding(NaN, under66, Y).netMonthly).toBe(0);
    expect(monthlyWithholding(-5, under66, Y).tax).toBe(0);
  });
});

describe('year resolution', () => {
  it('falls back to the newest known year', () => {
    expect(resolveTaxYear(2026).year).toBe(2026);
    expect(resolveTaxYear(2030).year).toBe(2026);
    expect(resolveTaxYear(2020).year).toBe(2026);
    expect(isTaxYearStale(2026)).toBe(false);
    expect(isTaxYearStale(2027)).toBe(true);
  });
  it('has 290 kommuner in Swedish order', () => {
    const list = kommunerFor(2026);
    expect(list).toHaveLength(290);
    expect(list[0].name).toBe('Ale');
    expect(list[list.length - 1].name).toBe('Övertorneå');
  });
});

describe('one-off payments', () => {
  it('uses the column 1 engångsbelopp bands', () => {
    expect(oneOffWithholdingRate(300_000, Y)).toBe(0.26);
    expect(oneOffWithholdingRate(700_000, Y)).toBe(0.54);
    expect(oneOffWithholdingRate(20_000, Y)).toBe(0);
  });
});
