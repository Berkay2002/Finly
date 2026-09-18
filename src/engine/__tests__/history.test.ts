import { describe, expect, it } from 'vitest';
import {
  buildSnapshot,
  endOfMonthDate,
  freezePlan,
  isFrozen,
  isProvisional,
  monthsToClose,
  snapshotDateFor,
  type SnapshotMap,
} from '../history';
import { savingsPots } from '../savings';
import { NOW, expense, prdExamplePlan } from './fixtures';

const closable = () => {
  const plan = prdExamplePlan();
  plan.onboarding.completed = true;
  return plan;
};

describe('month dates', () => {
  it('ends February 2026 on the 28th', () => {
    const d = endOfMonthDate('2026-02');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 1, 28]);
  });

  it('uses today for the running month and the last day for a past one', () => {
    expect(snapshotDateFor('2026-09', NOW)).toBe(NOW);
    expect(snapshotDateFor('2026-08', NOW).getDate()).toBe(31);
  });
});

describe('buildSnapshot', () => {
  it('computes a past month with that month as "now"', () => {
    const plan = closable();
    plan.expenses.push(
      expense({ name: 'Dentist', amount: 1500, frequency: 'once', nextDate: '2026-08-20', essential: false, committed: false }),
    );
    const aug = buildSnapshot(plan, '2026-08', NOW);
    const sep = buildSnapshot(plan, '2026-09', NOW);
    expect(aug.savedAt).toBe(NOW.toISOString());
    // August carries the whole one-off; by September it is history, not a twelfth to keep paying.
    expect(aug.safeToSpend).toBeCloseTo(sep.safeToSpend - 1500 - 1500 / 12, 5);
  });

  it('records balances per account and goal plus the emergency total', () => {
    const plan = closable();
    const snap = buildSnapshot(plan, '2026-08', NOW);
    expect(snap.byAccount).toEqual(Object.fromEntries(plan.accounts.map((a) => [a.id, a.balance])));
    expect(snap.byGoal).toEqual(Object.fromEntries(savingsPots(plan).map((g) => [g.id, g.currentAmount])));
    expect(snap.byGoal?.g1).toBe(40000);
    expect(snap.emergency).toBe(40000);
    expect(snap.plan).toBeDefined();
  });

  it('closes a past month with the balances of that month, not today\'s', () => {
    const plan = closable();
    const [a0] = plan.accounts;
    a0.balances = { '2026-07': 1000, '2026-08': 2000 };
    a0.balance = 9999;
    const aug = buildSnapshot(plan, '2026-08', NOW);
    const jul = buildSnapshot(plan, '2026-07', NOW);
    const sep = buildSnapshot(plan, '2026-09', NOW);
    expect(aug.byAccount?.[a0.id]).toBe(2000);
    expect(jul.byAccount?.[a0.id]).toBe(1000);
    expect(sep.byAccount?.[a0.id]).toBe(9999);
    expect(aug.totalAssets - jul.totalAssets).toBe(1000);
    expect(aug.plan?.accounts[0].balance).toBe(2000);
  });

  it('records what each category really cost and what income arrived', () => {
    const plan = closable();
    plan.expenses[0].actuals = { '2026-08': plan.expenses[0].amount + 300 };
    plan.income[0].actuals = { '2026-08': 30000 };
    const snap = buildSnapshot(plan, '2026-08', NOW);
    expect(snap.byCategoryActual![plan.expenses[0].category]).toBe(snap.byCategory[plan.expenses[0].category] + 300);
    expect(snap.incomeReceived).toBe(30000);
    expect(buildSnapshot(closable(), '2026-08', NOW).incomeReceived).toBeUndefined();
  });
});

describe('freezePlan', () => {
  it("keeps only that month's bill and drops balance history", () => {
    const plan = closable();
    plan.expenses[0].actuals = { '2026-07': 400, '2026-08': 500, '2026-09': 600 };
    plan.accounts[0].balances = { '2026-08': 1, '2026-09': 2 };
    plan.goals[0].balances = { '2026-09': 2 };
    plan.isSample = true;
    const frozen = freezePlan(plan, '2026-08');
    expect(frozen.expenses[0].actuals).toEqual({ '2026-08': 500 });
    expect(frozen.expenses[1].actuals).toBeUndefined();
    expect(frozen.accounts[0].balances).toBeUndefined();
    expect(frozen.goals[0].balances).toBeUndefined();
    expect(frozen.isSample).toBeUndefined();
    // the live plan is untouched
    expect(plan.expenses[0].actuals).toEqual({ '2026-07': 400, '2026-08': 500, '2026-09': 600 });
  });

  it('drops how bank lines get sorted, which is not a figure of the month', () => {
    const plan = { ...prdExamplePlan(), bank: { provider: 'p', appId: 'x', sessions: [], merchants: { ICA: { group: 'food' as const } }, lines: { a: { action: 'ignore' as const } } } };
    expect(freezePlan(plan, '2026-08').bank).toEqual({ provider: 'p', appId: 'x', sessions: [] });
    expect(plan.bank.merchants).toBeDefined();
  });

  it('drops the profile picture so history does not carry copies of it', () => {
    const plan = { ...prdExamplePlan(), avatar: 'data:image/jpeg;base64,AAAA' };
    expect(freezePlan(plan, '2026-08').avatar).toBeUndefined();
    expect(plan.avatar).toBeDefined();
  });
});

describe('monthsToClose', () => {
  const created = (monthsAgo: number) => {
    const plan = closable();
    plan.createdAt = new Date(NOW.getFullYear(), NOW.getMonth() - monthsAgo, 5).toISOString();
    return plan;
  };

  it('never closes the demo plan or one still in onboarding', () => {
    const sample = created(3);
    sample.isSample = true;
    expect(monthsToClose(sample, {}, NOW)).toEqual([]);
    const fresh = created(3);
    fresh.onboarding.completed = false;
    expect(monthsToClose(fresh, {}, NOW)).toEqual([]);
  });

  it('has nothing to close for a plan created this month', () => {
    expect(monthsToClose(created(0), {}, NOW)).toEqual([]);
  });

  it('closes every month since creation, oldest first', () => {
    expect(monthsToClose(created(3), {}, NOW)).toEqual(['2026-06', '2026-07', '2026-08']);
  });

  it('skips months already closed but re-closes provisional ones', () => {
    const plan = created(3);
    const final = buildSnapshot(plan, '2026-06', NOW);
    const provisional = buildSnapshot(plan, '2026-07', new Date(2026, 6, 20));
    const legacy = { ...buildSnapshot(plan, '2026-08', NOW), plan: undefined };
    expect(isProvisional(final)).toBe(false);
    expect(isProvisional(provisional)).toBe(true);
    const snapshots: SnapshotMap = { '2026-06': final, '2026-07': provisional, '2026-08': legacy };
    expect(monthsToClose(plan, snapshots, NOW)).toEqual(['2026-07']);
  });

  it('caps how far back it looks', () => {
    expect(monthsToClose(created(30), {}, NOW, { maxMonths: 2 })).toEqual(['2026-07', '2026-08']);
    expect(monthsToClose(created(30), {}, NOW)).toHaveLength(12);
  });
});

describe('isFrozen', () => {
  it('is true only for past months with a frozen plan', () => {
    const plan = closable();
    const snapshots: SnapshotMap = {
      '2026-08': buildSnapshot(plan, '2026-08', NOW),
      '2026-09': buildSnapshot(plan, '2026-09', NOW),
      '2026-07': { ...buildSnapshot(plan, '2026-07', NOW), plan: undefined },
    };
    expect(isFrozen(snapshots, '2026-08', NOW)).toBe(true);
    expect(isFrozen(snapshots, '2026-09', NOW)).toBe(false);
    expect(isFrozen(snapshots, '2026-07', NOW)).toBe(false);
    expect(isFrozen(snapshots, '2026-05', NOW)).toBe(false);
  });
});
