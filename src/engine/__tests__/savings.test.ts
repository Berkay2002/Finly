import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../metrics';
import { migrateLinkedGoals, savingsPots } from '../savings';
import type { Account, FinancialPlan, SavingsGoal } from '../types';
import { NOW, prdExamplePlan } from './fixtures';

const goal = (g: Partial<SavingsGoal> & { id: string }): SavingsGoal => ({
  name: g.id,
  kind: 'investment',
  purpose: 'long_term',
  currentAmount: 0,
  monthlyContribution: 0,
  ...g,
});

const withSavings = (accounts: Account[], goals: SavingsGoal[]): FinancialPlan => ({ ...prdExamplePlan(), accounts, goals });

describe('savingsPots', () => {
  it('reads a linked goal’s amounts from its account', () => {
    const plan = withSavings(
      [{ id: 'isk', name: 'Avanza ISK', kind: 'isk', balance: 278_000, monthlyDeposit: 5000 }],
      [goal({ id: 'g', name: 'Avanza', linkedAccountId: 'isk', targetAmount: 500_000 })],
    );
    expect(savingsPots(plan)).toEqual([
      expect.objectContaining({ id: 'g', goalId: 'g', accountId: 'isk', name: 'Avanza', currentAmount: 278_000, monthlyContribution: 5000 }),
    ]);
  });

  it('shows savings accounts with no goal and leaves everyday accounts out', () => {
    const plan = withSavings(
      [
        { id: 'pay', name: 'Salary', kind: 'salary', balance: 13_000, monthlyDeposit: 100 },
        { id: 'kf', name: 'Barn KF', institution: 'Avanza', kind: 'kf', balance: 15_324, monthlyDeposit: 500 },
        { id: 'buf', name: 'Buffer', kind: 'emergency', balance: 30_000 },
      ],
      [goal({ id: 'car', kind: 'purchase', purpose: 'future_spending', currentAmount: 2000, monthlyContribution: 1000 })],
    );
    const pots = savingsPots(plan);
    expect(pots.map((p) => p.id)).toEqual(['car', 'kf', 'buf']);
    expect(pots[1]).toMatchObject({ accountId: 'kf', description: 'Avanza', kind: 'investment', purpose: 'long_term', currentAmount: 15_324 });
    expect(pots[1].goalId).toBeUndefined();
    expect(pots[2]).toMatchObject({ kind: 'emergency', monthlyContribution: 0 });
  });

  it('counts each deposit once in the monthly savings', () => {
    const plan = withSavings(
      [
        { id: 'isk', name: 'ISK', kind: 'isk', balance: 278_000, monthlyDeposit: 5000 },
        { id: 'sav', name: 'Sparkonto', kind: 'savings', balance: 10_000, monthlyDeposit: 800 },
      ],
      [
        goal({ id: 'g', linkedAccountId: 'isk' }),
        goal({ id: 'car', kind: 'purchase', purpose: 'future_spending', monthlyContribution: 1000 }),
      ],
    );
    const m = computeMetrics(plan, NOW);
    expect(m.savings.longTerm).toBe(5000 + 800);
    expect(m.savings.futureSpending).toBe(1000);
    expect(m.savings.total).toBe(6800);
  });
});

describe('migrateLinkedGoals', () => {
  it('keeps the account balance and moves the goal’s contribution to the deposit', () => {
    const plan = withSavings(
      [{ id: 'isk', name: 'ISK', kind: 'isk', balance: 278_000, monthlyDeposit: 1500 }],
      [goal({ id: 'g', linkedAccountId: 'isk', currentAmount: 270_000, balances: { '2026-08': 270_000 }, monthlyContribution: 5000 })],
    );
    const next = migrateLinkedGoals(plan);
    expect(next.accounts[0]).toMatchObject({ balance: 278_000, monthlyDeposit: 5000 });
    expect(next.goals[0]).toMatchObject({ linkedAccountId: 'isk', currentAmount: 0, monthlyContribution: 0 });
    expect(next.goals[0].balances).toBeUndefined();
    expect(migrateLinkedGoals(next)).toBe(next);
  });

  it('keeps the account’s own deposit when the goal had no contribution', () => {
    const plan = withSavings(
      [{ id: 'isk', name: 'ISK', kind: 'isk', balance: 2500, monthlyDeposit: 300 }],
      [goal({ id: 'g', linkedAccountId: 'isk', currentAmount: 2500 })],
    );
    expect(migrateLinkedGoals(plan).accounts[0].monthlyDeposit).toBe(300);
  });

  it('unlinks goals whose account is gone, and second goals on one account', () => {
    const plan = withSavings(
      [{ id: 'isk', name: 'ISK', kind: 'isk', balance: 100 }],
      [
        goal({ id: 'a', linkedAccountId: 'isk', monthlyContribution: 100 }),
        goal({ id: 'b', linkedAccountId: 'isk', currentAmount: 50, monthlyContribution: 200 }),
        goal({ id: 'c', linkedAccountId: 'gone', currentAmount: 70 }),
      ],
    );
    const next = migrateLinkedGoals(plan);
    expect(next.goals[0].linkedAccountId).toBe('isk');
    expect(next.goals[1]).toMatchObject({ currentAmount: 50, monthlyContribution: 200 });
    expect(next.goals[1].linkedAccountId).toBeUndefined();
    expect(next.goals[2]).toMatchObject({ currentAmount: 70 });
    expect(next.goals[2].linkedAccountId).toBeUndefined();
    expect(next.accounts[0].monthlyDeposit).toBe(100);
  });

  it('links a goal that repeats a savings account’s balance only when asked', () => {
    const plan = withSavings(
      [
        { id: 'pay', name: 'Salary', kind: 'salary', balance: 40_000 },
        { id: 'buf', name: 'Buffer', kind: 'emergency', balance: 40_000 },
      ],
      [goal({ id: 'g', kind: 'emergency', currentAmount: 40_000, monthlyContribution: 2000 })],
    );
    expect(migrateLinkedGoals(plan)).toBe(plan);
    const next = migrateLinkedGoals(plan, { autoLink: true });
    expect(next.goals[0]).toMatchObject({ linkedAccountId: 'buf', currentAmount: 0, monthlyContribution: 0 });
    expect(next.accounts[1].monthlyDeposit).toBe(2000);
    expect(computeMetrics(next, NOW).savings.total).toBe(computeMetrics(plan, NOW).savings.total);
  });

  it('leaves a plan with nothing to migrate as it is', () => {
    const plan = prdExamplePlan();
    expect(migrateLinkedGoals(plan, { autoLink: true })).toBe(plan);
  });
});
