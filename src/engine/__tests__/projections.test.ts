import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../metrics';
import { allGoalProgress, goalProgress, monthOutlook, savingsProjection, upcomingExpenses } from '../projections';
import type { SavingsGoal } from '../types';
import { NOW, prdExamplePlan } from './fixtures';

describe('upcomingExpenses (§18.10)', () => {
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

  it('maps all goals in a plan', () => {
    expect(allGoalProgress(prdExamplePlan(), NOW)).toHaveLength(3);
  });
});

describe('savingsProjection (§18.11)', () => {
  it('adds monthly contributions over 12 months', () => {
    const plan = prdExamplePlan();
    const m = computeMetrics(plan, NOW);
    const proj = savingsProjection(plan, m, NOW);
    expect(proj).toHaveLength(12);
    expect(proj[11].added).toBe(72000);
    expect(proj[11].balance).toBe(214000 + 72000);
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
