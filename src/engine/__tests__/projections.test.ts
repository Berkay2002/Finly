import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../metrics';
import { allGoalProgress, expectedReturnsBy, goalProgress, monthOutlook, monthsAhead, projectPlan, savingsProjection, upcomingExpenses } from '../projections';
import type { Debt, SavingsGoal } from '../types';
import { expense, NOW, prdExamplePlan } from './fixtures';

describe('upcomingExpenses (§18.10)', () => {
  it('omits elapsed dates from upcoming, but retains them in the full month outlook', () => {
    const p = prdExamplePlan();
    p.expenses.push(expense({ id: 'past', name: 'Gift', amount: 1000, frequency: 'once', nextDate: '2026-09-02' }));
    p.expenses.push(expense({ id: 'today', name: 'Today', amount: 200, frequency: 'once', nextDate: '2026-09-16' }));
    const afternoon = new Date(2026, 8, 16, 15);
    const upcoming = upcomingExpenses(p, afternoon);
    expect(upcoming.some((e) => e.expenseId === 'past')).toBe(false);
    expect(upcoming.some((e) => e.expenseId === 'today')).toBe(true);
    expect(monthOutlook(p, computeMetrics(p, afternoon), afternoon)[0].items.some((e) => e.expenseId === 'past')).toBe(true);
  });

  const plan = prdExamplePlan();
  const up = upcomingExpenses(plan, NOW);

  it('lists irregular items in date order within 12 months', () => {
    expect(up.map((u) => u.name)).toEqual(['Vehicle tax', 'Christmas', 'Holiday']);
    expect(up[0].date.getMonth()).toBe(9); // October
    expect(up[0].amount).toBe(3000);
  });

  it('rolls forward past dates for recurring items', () => {
    const p = prdExamplePlan();
    p.expenses.find((e) => e.id === 'vehicle_tax')!.nextDate = '2025-10-12';
    const next = upcomingExpenses(p, NOW).find((u) => u.expenseId === 'vehicle_tax')!;
    expect(next.date.getFullYear()).toBe(2026);
    expect(next.date.getMonth()).toBe(9);
  });

  it('includes multiple occurrences of quarterly items', () => {
    const p = prdExamplePlan();
    p.expenses.push({
      id: 'q',
      name: 'Quarterly fee',
      category: 'finance',
      subcategory: 'custom',
      amount: 900,
      frequency: 'quarterly',
      nextDate: '2026-10-01',
      fixed: true,
      essential: true,
      committed: true,
      tags: [],
    });
    const occurrences = upcomingExpenses(p, NOW).filter((u) => u.expenseId === 'q');
    expect(occurrences).toHaveLength(4);
  });

  it('drops one-offs that are already in the past', () => {
    const p = prdExamplePlan();
    p.expenses.push({
      id: 'past',
      name: 'Past',
      category: 'planned',
      subcategory: 'custom',
      amount: 100,
      frequency: 'once',
      nextDate: '2026-01-01',
      fixed: true,
      essential: false,
      committed: false,
      tags: [],
    });
    expect(upcomingExpenses(p, NOW).find((u) => u.expenseId === 'past')).toBeUndefined();
  });
});

describe('monthOutlook (§18.10)', () => {
  const plan = prdExamplePlan();
  const m = computeMetrics(plan, NOW);
  const outlook = monthOutlook(plan, m, NOW);

  it('covers 12 months starting with the current one', () => {
    expect(outlook).toHaveLength(12);
    expect(outlook[0].month.getMonth()).toBe(8);
  });

  it('shows months with irregular bills as above normal', () => {
    const october = outlook[1];
    // irregular provision: 250 + 1000 + 500 = 1750/month; October has 3000 of vehicle tax
    expect(october.aboveNormal).toBeCloseTo(3000 - 1750, 5);
    const november = outlook[2];
    expect(november.aboveNormal).toBeCloseTo(-1750, 5);
  });

  it('a normal year sums to roughly twelve lifestyle costs', () => {
    const total = outlook.reduce((a, b) => a + b.expected, 0);
    // vehicle tax 3000 + christmas 6000 + holiday 12000 all fall within the window
    expect(total).toBeCloseTo(m.lifestyleCost * 12, 0);
  });
});

describe('goalProgress (§18.9)', () => {
  it('computes progress and the expected completion date', () => {
    const goal: SavingsGoal = {
      id: 'g',
      name: 'Car fund',
      kind: 'purchase',
      purpose: 'future_spending',
      currentAmount: 64000,
      monthlyContribution: 4000,
      targetAmount: 100000,
    };
    const p = goalProgress(goal, NOW);
    expect(p.progress).toBeCloseTo(0.64, 5);
    expect(p.remaining).toBe(36000);
    expect(p.monthsToTarget).toBe(9);
    expect(p.completionDate?.getFullYear()).toBe(2027);
    expect(p.completionDate?.getMonth()).toBe(5);
  });

  it('is never reached without contributions', () => {
    const p = goalProgress(
      { id: 'g', name: 'X', kind: 'custom', purpose: 'future_spending', currentAmount: 0, monthlyContribution: 0, targetAmount: 100 },
      NOW,
    );
    expect(p.monthsToTarget).toBe(Infinity);
    expect(p.completionDate).toBeNull();
  });

  it('reports whether a target date is on track', () => {
    const p = goalProgress(
      {
        id: 'g',
        name: 'X',
        kind: 'custom',
        purpose: 'future_spending',
        currentAmount: 0,
        monthlyContribution: 1000,
        targetAmount: 12000,
        targetDate: '2027-09-16',
      },
      NOW,
    );
    expect(p.requiredMonthly).toBeCloseTo(1000, 5);
    expect(p.onTrack).toBe(true);
  });

  it('handles reached goals', () => {
    const p = goalProgress(
      { id: 'g', name: 'X', kind: 'custom', purpose: 'future_spending', currentAmount: 500, monthlyContribution: 10, targetAmount: 100 },
      NOW,
    );
    expect(p.progress).toBe(1);
    expect(p.monthsToTarget).toBe(0);
  });

  it('maps all goals and savings accounts without a goal in a plan', () => {
    expect(allGoalProgress(prdExamplePlan(), NOW)).toHaveLength(4);
  });
});

describe('savingsProjection (§18.11)', () => {
  it('adds monthly contributions over 12 months', () => {
    const plan = prdExamplePlan();
    const m = computeMetrics(plan, NOW);
    const proj = savingsProjection(plan, m, NOW);
    expect(proj).toHaveLength(12);
    expect(proj[11].added).toBe(72000);
    // Goals 40 000 + 110 000 (from their accounts) + 64 000, and the savings account's 72 000.
    expect(proj[11].balance).toBe(286000 + 72000);
  });

  it('optionally assumes unallocated money is also saved', () => {
    const plan = prdExamplePlan();
    const m = computeMetrics(plan, NOW);
    const proj = savingsProjection(plan, m, NOW, 12, { includeUnallocated: true });
    expect(proj[11].added).toBe((6000 + 4800) * 12);
  });
});

describe('ranges in the outlook', () => {
  it('carries the expected low and high of each upcoming occurrence', () => {
    const p = prdExamplePlan();
    p.expenses.find((e) => e.id === 'vehicle_tax')!.fixed = false;
    p.expenses.find((e) => e.id === 'vehicle_tax')!.range = { low: 2500, high: 3500 };
    const tax = upcomingExpenses(p, NOW).find((u) => u.expenseId === 'vehicle_tax')!;
    expect(tax).toMatchObject({ amount: 3000, low: 2500, high: 3500 });
    const xmas = upcomingExpenses(p, NOW).find((u) => u.expenseId === 'christmas')!;
    expect(xmas).toMatchObject({ amount: 6000, low: 6000, high: 6000 });
  });

  it('shows what a month costs if every variable bill runs high', () => {
    const plan = prdExamplePlan();
    const m = computeMetrics(plan, NOW);
    const out = monthOutlook(plan, m, NOW);
    // Regular spend is lifestyle minus the provision for irregular items; high adds 800 of spread.
    const sep = out[0];
    expect(sep.expectedHigh - sep.expected).toBe(800);
  });
});

describe('projectPlan (a later month)', () => {
  const csn: Debt = {
    id: 'csn',
    name: 'CSN',
    kind: 'csn',
    csnType: 'annuity',
    balance: 440_000,
    rate: 2.135,
    payment: 4500,
    frequency: 'quarterly',
    nextDate: '2027-02-28',
  };

  it('is the plan itself for this month or an earlier one', () => {
    const plan = prdExamplePlan();
    expect(monthsAhead(NOW, NOW)).toBe(0);
    expect(projectPlan(plan, NOW, NOW)).toBe(plan);
    expect(projectPlan(plan, NOW, new Date(2026, 5, 1))).toBe(plan);
  });

  it('adds the deposit and return of each month to the accounts', () => {
    const plan = prdExamplePlan();
    const nov = projectPlan(plan, NOW, new Date(2026, 10, 1));
    const by = Object.fromEntries(nov.accounts.map((a) => [a.id, a]));
    expect(by.a2.balance).toBe(72000); // no deposit, no return
    expect(by.a3.balance).toBe(40000 + 2 * 2000);
    expect(by.a4.balance).toBe(110000 + 2 * 3000); // no expected return set
    expect(by.a3.balances).toEqual({ '2026-09': 40000, '2026-10': 42000, '2026-11': 44000 });
    expect(plan.accounts[2].balance).toBe(40000); // the live plan is untouched
  });

  it('leaves the expected return out of the balances: it is a forecast, not money in the bank', () => {
    const plan = prdExamplePlan();
    plan.accounts.push({ id: 'isk', name: 'ISK', kind: 'isk', balance: 50000, monthlyDeposit: 5500, expectedReturn: 6 });
    const oct = projectPlan(plan, NOW, new Date(2026, 9, 1)).accounts.find((a) => a.id === 'isk')!;
    expect(oct.balance).toBe(55500);
    expect(expectedReturnsBy(plan, NOW, NOW)).toBe(0);
  });

  it('compounds the return after tax on an ISK when asked to', () => {
    const plan = prdExamplePlan();
    plan.accounts.push({ id: 'isk', name: 'ISK', kind: 'isk', balance: 50000, monthlyDeposit: 5500, expectedReturn: 6 });
    const at = (to: Date) => projectPlan(plan, NOW, to, undefined, { withReturns: true }).accounts.find((a) => a.id === 'isk')!;
    // The ISK's yearly tax is a small drag on 6 %; one month of it on 50 000 is under 250 kr.
    const oct = at(new Date(2026, 9, 1));
    expect(oct.balance).toBeGreaterThan(55500);
    expect(oct.balance).toBeLessThan(55500 + 250);
    expect(at(new Date(2027, 8, 1)).balance).toBeGreaterThan(50000 * 1.05 + 12 * 5500);
    expect(expectedReturnsBy(plan, NOW, new Date(2026, 9, 1))).toBeCloseTo(oct.balance - 55500, 6);
  });

  it('keeps what each month leaves over on the salary account', () => {
    const plan = prdExamplePlan();
    const room = computeMetrics(plan, NOW).breathingRoom;
    expect(room).toBeGreaterThan(0);
    plan.expenses.push(expense({ id: 'sofa', name: 'Sofa', category: 'home', amount: 7000, frequency: 'once', nextDate: '2026-11-10' }));
    const salary = (to: Date) => projectPlan(plan, NOW, to).accounts.find((a) => a.id === 'a1')!.balance;
    expect(salary(new Date(2026, 9, 1))).toBeCloseTo(18500 + room, 6);
    expect(salary(new Date(2026, 10, 1))).toBeCloseTo(18500 + 2 * room - 7000, 6);
  });

  it('lands the leftover on the first everyday account when there is no salary account', () => {
    const plan = prdExamplePlan();
    plan.accounts[0] = { ...plan.accounts[0], kind: 'everyday' };
    plan.accounts.push({ id: 'a5', name: 'Joint', kind: 'joint', balance: 5000 });
    const room = computeMetrics(plan, NOW).breathingRoom;
    const oct = projectPlan(plan, NOW, new Date(2026, 9, 1));
    expect(oct.accounts[0].balance).toBeCloseTo(18500 + room, 6);
    expect(oct.accounts.find((a) => a.id === 'a5')!.balance).toBe(5000);
  });

  it('adds an everyday account to land on when the plan has none', () => {
    const plan = prdExamplePlan();
    plan.accounts = plan.accounts.filter((a) => a.id !== 'a1');
    const room = computeMetrics(plan, NOW).breathingRoom;
    const oct = projectPlan(plan, NOW, new Date(2026, 9, 1));
    expect(oct.accounts).toHaveLength(plan.accounts.length + 1);
    expect(oct.accounts.at(-1)).toMatchObject({ id: 'acc_everyday', kind: 'everyday', balance: room });
    expect(plan.accounts.find((a) => a.kind === 'everyday')).toBeUndefined();
  });

  it('adds the contribution to a goal saved outside any account', () => {
    const plan = prdExamplePlan();
    const jan = projectPlan(plan, NOW, new Date(2027, 0, 1));
    expect(jan.goals.find((g) => g.id === 'g3')!.currentAmount).toBe(64000 + 4 * 1000);
    expect(jan.goals.find((g) => g.id === 'g1')!.currentAmount).toBe(0); // linked: the account holds it
  });

  it('takes the payments off a loan as the months pass', () => {
    const plan = prdExamplePlan();
    plan.debts = [csn];
    const balanceIn = (y: number, m0: number) => projectPlan(plan, NOW, new Date(y, m0, 1)).debts![0].balance;
    const dec = balanceIn(2026, 11);
    const mar = balanceIn(2027, 2);
    // Repayment starts with the quarter ending in February 2027: until then only interest builds up.
    expect(dec).toBeGreaterThan(440_000);
    expect(mar).toBeLessThan(dec);
    expect(dec - mar).toBeGreaterThan(4500 - 3 * ((dec * 0.02135) / 12)); // the quarter's payment less its interest
    expect(plan.debts[0].balance).toBe(440_000);
  });

  it('keeps a loan with no rate at its balance', () => {
    const plan = prdExamplePlan();
    plan.debts = [{ ...csn, rate: undefined }];
    expect(projectPlan(plan, NOW, new Date(2027, 5, 1)).debts![0].balance).toBe(440_000);
  });

  it('net worth in a later month counts the months in between', () => {
    const plan = prdExamplePlan();
    const { breathingRoom, position } = computeMetrics(plan, NOW);
    const later = computeMetrics(projectPlan(plan, NOW, new Date(2026, 11, 1)), new Date(2026, 11, 1)).position.netWorth;
    expect(later).toBeCloseTo(position.netWorth + 3 * (2000 + 3000 + breathingRoom), 6);
  });
});
