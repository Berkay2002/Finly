import { describe, expect, it, vi } from 'vitest';
import { buildOutlook, parseGovBondRate } from '../../../api/rates';
import { goalProgress, savingsProjection, upcomingExpenses, SAVINGS_TAX_ID } from '../projections';
import { computeMetrics } from '../metrics';
import { BUNDLED_OUTLOOK } from '../rates';
import {
  capitalTaxSummary,
  iskUnderlag,
  kfUnderlag,
  lossValue,
  resolveCapitalYear,
  savingsNudges,
  valueAtMonthStart,
} from '../tax/capital';
import type { Account, FinancialPlan, SavingsGoal } from '../types';
import { NOW, prdExamplePlan } from './fixtures';

const account = (partial: Partial<Account> & { kind: Account['kind'] }): Account => ({
  id: partial.id ?? partial.kind,
  name: partial.name ?? partial.kind,
  balance: 0,
  ...partial,
});

const plan = (accounts: Account[], goals: SavingsGoal[] = []) => ({ accounts, goals });

describe('resolveCapitalYear', () => {
  it('uses the statslåneränta of 30 November the year before, plus one point (Skatteverket, ISK 2026)', () => {
    expect(resolveCapitalYear(2026)).toEqual({ year: 2026, slr: 2.55, schablonRate: 3.55, taxFree: 300_000, preliminary: false });
    expect(resolveCapitalYear(2025)).toMatchObject({ schablonRate: 2.96, taxFree: 150_000 });
    expect(resolveCapitalYear(2024)).toMatchObject({ schablonRate: 3.62, taxFree: 0 });
  });

  it("estimates a year whose 30 November has not come from today's rate, and locks it once it has", () => {
    expect(resolveCapitalYear(2027, BUNDLED_OUTLOOK.govBondRate)).toMatchObject({ slr: 2.99, schablonRate: 3.99, taxFree: 300_000, preliminary: true });
    const after = { date: '2026-12-04', value: 3.1, nov30: { '2026': 2.8 } };
    expect(resolveCapitalYear(2027, after)).toMatchObject({ slr: 2.8, preliminary: false });
  });

  it('never goes below 1.25 %', () => {
    expect(resolveCapitalYear(2030, { date: '2029-12-01', value: 0.1, nov30: {} }).schablonRate).toBe(1.25);
  });
});

describe('kapitalunderlag', () => {
  it('ISK: the four quarter values plus the year’s deposits, divided by four', () => {
    expect(iskUnderlag([100_000, 110_000, 120_000, 130_000], 40_000)).toBe(125_000);
  });

  it('KF: value on 1 January plus premiums, those from 1 July at half', () => {
    expect(kfUnderlag(100_000, 60_000, 60_000)).toBe(190_000);
  });

  it('reads recorded month-end balances for past quarters and grows today’s balance for later ones', () => {
    const a = account({ kind: 'isk', balance: 100_000, expectedReturn: 12, balances: { '2025-12': 90_000, '2026-05': 95_000 } });
    expect(valueAtMonthStart(a, 2026, 0, NOW, 0)).toBe(90_000);
    // 1 April: nothing recorded for March, so the closest earlier balance.
    expect(valueAtMonthStart(a, 2026, 3, NOW, 0)).toBe(90_000);
    expect(valueAtMonthStart(a, 2026, 6, NOW, 0)).toBe(95_000);
    // 1 October: the month before is this month, so today's balance.
    expect(valueAtMonthStart(a, 2026, 9, NOW, 0)).toBe(100_000);
    // 1 January 2027: three months of growth at 12 % a year.
    expect(valueAtMonthStart(a, 2027, 0, NOW, 0)).toBeCloseTo(100_000 * Math.pow(1.12, 3 / 12), 6);
  });
});

describe('capitalTaxSummary', () => {
  it('taxes only the ISK underlag above 300 000 kr', () => {
    const isk = account({ kind: 'isk', balance: 610_000, balances: { '2025-12': 580_000, '2026-03': 590_000, '2026-06': 600_000 } });
    const s = capitalTaxSummary(plan([isk]), NOW);
    expect(s.schablonUnderlag).toBe(595_000);
    // (595 000 − 300 000) × 3.55 % × 30 %
    expect(s.total).toBeCloseTo(3141.75, 6);
    expect(s.accounts[0].taxBeforeFree).toBeCloseTo(6336.75, 6);
    expect(s.slutskatt).toBeCloseTo(3141.75, 6);
    expect(s.taxFreeLeft).toBe(0);
  });

  it('shares one tax-free level across ISK and KF, and refunds what the insurer took on the free part', () => {
    const s = capitalTaxSummary(plan([account({ kind: 'isk', balance: 400_000 }), account({ kind: 'kf', balance: 200_000 })]), NOW);
    const [isk, kf] = s.accounts;
    expect(isk.tax).toBeCloseTo(2130, 6);
    expect(kf.tax).toBeCloseTo(1065, 6);
    expect(kf.withheld).toBeCloseTo(2130, 6);
    expect(s.kfRefund).toBeCloseTo(1065, 6);
    expect(s.slutskatt).toBeCloseTo(2130 - 1065, 6);
    expect(s.total).toBeCloseTo(3195, 6);
    // Half the underlag is taxed: the drag is 3.55 % × 30 % × 0.5.
    expect(isk.netReturn).toBeCloseTo(0 - 3.55 * 0.3 * 0.5, 6);
  });

  it('is zero under the tax-free level, and counts the monthly deposit', () => {
    const isk = account({ id: 'i', kind: 'isk', balance: 0, expectedReturn: 7, monthlyDeposit: 1000 });
    const s = capitalTaxSummary(plan([isk]), NOW);
    expect(s.schablonUnderlag).toBe(3000);
    expect(s.total).toBe(0);
    expect(s.accounts[0].netReturn).toBe(7);
  });

  it('AF: fund schablon and dividend tax each year, 30 % of the gain only if sold', () => {
    const af = account({ kind: 'af', balance: 200_000, costBasis: 150_000, fundShare: 50, dividendYield: 4, expectedReturn: 7 });
    const [t] = capitalTaxSummary(plan([af]), NOW).accounts;
    expect(t.underlag).toBe(100_000);
    expect(t.tax).toBeCloseTo(120 + 1200, 6);
    expect(t.withheld).toBeCloseTo(1200, 6);
    expect(t.slutskatt).toBeCloseTo(120, 6);
    expect(t.gain).toBe(50_000);
    expect(t.taxIfSold).toBe(15_000);
    expect(t.netReturn).toBeCloseTo(7 - 0.66, 6);
    expect(lossValue(10_000)).toEqual({ againstGains: 3000, otherwise: 2100 });
  });

  it('cash: 30 % of the interest, taken by the bank', () => {
    const [t] = capitalTaxSummary(plan([account({ kind: 'savings', balance: 100_000, interestRate: 3 })]), NOW).accounts;
    expect(t.tax).toBeCloseTo(900, 6);
    expect(t.withheld).toBeCloseTo(900, 6);
    expect(t.slutskatt).toBe(0);
    expect(t.netReturn).toBeCloseTo(2.1, 6);
  });

  it('leaves investment accounts without a wrapper out', () => {
    const s = capitalTaxSummary(plan([account({ kind: 'investment', balance: 500_000 })]), NOW);
    expect(s.total).toBe(0);
    expect(s.unknownBalance).toBe(500_000);
  });
});

describe('savingsNudges', () => {
  it('suggests an ISK for cash and AF when it would save tax, and warns above the deposit guarantee', () => {
    const accounts = [
      account({ id: 's', kind: 'savings', balance: 50_000, interestRate: 2, institution: 'SEB' }),
      account({ id: 'big', kind: 'emergency', balance: 1_200_000, institution: 'seb ' }),
      account({ id: 'i', kind: 'isk', balance: 100_000 }),
      account({ id: 'a', kind: 'af', balance: 200_000, costBasis: 120_000, expectedReturn: 7 }),
      account({ id: 'x', kind: 'investment', balance: 5000 }),
    ];
    const nudges = savingsNudges({ accounts }, capitalTaxSummary(plan(accounts), NOW));
    expect(nudges.map((n) => n.kind)).toEqual(['pick_wrapper', 'cash_to_isk', 'af_to_isk', 'deposit_guarantee']);
    expect(nudges[1]).toMatchObject({ cash: 50_000, room: 200_000, interestTax: 300 });
    expect(nudges[2]).toMatchObject({ breakEven: 3.55, taxIfSold: 24_000 });
    expect(nudges[3]).toMatchObject({ institution: 'SEB', amount: 1_250_000 });
  });

  it('says nothing about AF when the expected return is below the schablonränta', () => {
    const accounts = [account({ kind: 'af', balance: 200_000, expectedReturn: 3 })];
    expect(savingsNudges({ accounts }, capitalTaxSummary(plan(accounts), NOW))).toEqual([]);
  });
});

describe('savings tax in the plan', () => {
  const withIsk = (): FinancialPlan => {
    const p = prdExamplePlan();
    p.accounts = [account({ id: 'i', kind: 'isk', balance: 700_000, expectedReturn: 6 })];
    return p;
  };

  it('puts the ISK tax on 12 May next year and in the net worth after tax', () => {
    const tax = upcomingExpenses(withIsk(), NOW).filter((u) => u.source === 'tax');
    expect(tax).toHaveLength(1);
    expect(tax[0]).toMatchObject({ expenseId: SAVINGS_TAX_ID, name: 'Tax on savings 2026', category: 'finance' });
    expect(tax[0].date).toEqual(new Date(2027, 4, 12));
    const m = computeMetrics(withIsk(), NOW);
    expect(tax[0].amount).toBeCloseTo(m.capitalTax.slutskatt, 6);
    expect(m.position.netWorthAfterTax).toBeCloseTo(m.position.netWorth - m.capitalTax.total, 6);
  });

  it('compounds a goal through its linked account', () => {
    const goal = { id: 'g', name: 'g', kind: 'investment', purpose: 'long_term', currentAmount: 0, monthlyContribution: 1000, targetAmount: 24_000 } as SavingsGoal;
    expect(goalProgress(goal, NOW).monthsToTarget).toBe(24);
    expect(goalProgress(goal, NOW, 12).monthsToTarget).toBe(22);
    const dated = goalProgress({ ...goal, targetDate: '2028-09-16' }, NOW, 12);
    // Paying the required amount each month for 24 months reaches the target.
    const r = Math.pow(1.12, 1 / 12) - 1;
    let balance = 0;
    for (let i = 0; i < 24; i += 1) balance = balance * (1 + r) + dated.requiredMonthly!;
    expect(balance).toBeCloseTo(24_000, 6);

    // Linked, the goal is the account: its balance and deposit.
    const p = withIsk();
    p.accounts[0].monthlyDeposit = 1000;
    p.goals = [{ ...goal, monthlyContribution: 0, linkedAccountId: 'i' }];
    const proj = savingsProjection(p, computeMetrics(p, NOW), NOW);
    expect(proj[11].balance).toBe(712_000);
    expect(proj[11].withReturns).toBeGreaterThan(712_000);
  });
});

describe('statslåneränta from Riksgälden', () => {
  const csv = [
    'Date;"Interest rate % ";Average so far this year %',
    '2026-09-11;2,99;2,70',
    '2025-12-05;2,67;2,33',
    '2025-11-28;2,55;2,33',
    '2025-11-21;2,55;2,32',
    '2024-11-29;1,96;2,15',
    '',
  ].join('\r\n');

  it('takes the latest rate and the one in force on 30 November each year', () => {
    expect(parseGovBondRate(csv)).toEqual({ date: '2026-09-11', value: 2.99, nov30: { '2024': 1.96, '2025': 2.55 } });
  });

  it('adds it to the outlook, and leaves it out when only Riksgälden fails', async () => {
    const swea = [{ date: '2026-09-15', value: 1.75 }];
    const forecasts = { data: [{ vintages: [{ metadata: { policy_round: 'x', policy_round_end_dtm: '2026-06-17' }, observations: [{ dt: '2026-12-31', value: 1.8 }] }] }] };
    const fetcher = (gov: Response) =>
      vi.fn(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.includes('riksgalden')) return gov;
        return Response.json(u.includes('swea') ? swea : forecasts);
      }) as unknown as typeof fetch;
    const ok = await buildOutlook(new Date('2026-09-16T12:00:00Z'), fetcher(new Response(csv)));
    expect(ok.govBondRate?.value).toBe(2.99);
    const down = await buildOutlook(new Date('2026-09-16T12:00:00Z'), fetcher(new Response('', { status: 503 })));
    expect(down.govBondRate).toBeUndefined();
    expect(down.policyRate.value).toBe(1.75);
  });
});
