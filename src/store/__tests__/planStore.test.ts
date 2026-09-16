import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyPlan } from '@/engine/types';
import { monthKeyOf } from '@/engine/metrics';
import { NOW, expense, prdExamplePlan } from '@/engine/__tests__/fixtures';

const memory = vi.hoisted(() => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
  // zustand's default storage is `window.localStorage`; give Node both.
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  Object.defineProperty(globalThis, 'window', { value: { localStorage: storage }, configurable: true });
  return storage;
});

import { parsePlan, usePlanStore } from '../planStore';
import { parsePlanFile, serializePlanFile } from '../planFile';

const thisMonth = monthKeyOf(new Date());

beforeEach(() => {
  usePlanStore.setState({ plan: emptyPlan(), snapshots: {} });
});

describe('balance history', () => {
  it('records an account balance under the current month', () => {
    const id = usePlanStore.getState().addAccount({ name: 'Salary', kind: 'salary', balance: 100 });
    usePlanStore.getState().updateAccount(id, { balance: 250 });
    const acc = usePlanStore.getState().plan.accounts[0];
    expect(acc.balance).toBe(250);
    expect(acc.balances).toEqual({ [thisMonth]: 250 });
  });

  it('leaves history alone when the balance is not part of the patch', () => {
    const id = usePlanStore.getState().addAccount({ name: 'Salary', kind: 'salary', balance: 100 });
    usePlanStore.getState().updateAccount(id, { name: 'Lön' });
    expect(usePlanStore.getState().plan.accounts[0].balances).toEqual({ [thisMonth]: 100 });
  });

  it('records goal progress under the current month', () => {
    const id = usePlanStore.getState().addGoal({
      name: 'Buffer',
      kind: 'emergency',
      purpose: 'long_term',
      currentAmount: 10,
      monthlyContribution: 5,
    });
    usePlanStore.getState().updateGoal(id, { currentAmount: 40 });
    expect(usePlanStore.getState().plan.goals[0].balances).toEqual({ [thisMonth]: 40 });
  });
});

describe('snapshots', () => {
  it('saves a past month with that month as now', () => {
    const plan = prdExamplePlan();
    plan.expenses.push(expense({ name: 'Dentist', amount: 1500, frequency: 'once', nextDate: '2026-08-20' }));
    usePlanStore.setState({ plan });
    usePlanStore.getState().saveSnapshot('2026-08', NOW);
    usePlanStore.getState().saveSnapshot('2026-09', NOW);
    const { snapshots } = usePlanStore.getState();
    expect(snapshots['2026-08'].safeToSpend).toBe(snapshots['2026-09'].safeToSpend - 1500);
  });

  it('closes due months once', () => {
    const plan = prdExamplePlan();
    plan.onboarding.completed = true;
    plan.createdAt = new Date(2026, 5, 1).toISOString();
    usePlanStore.setState({ plan });
    expect(usePlanStore.getState().closeMonths(NOW)).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(usePlanStore.getState().closeMonths(NOW)).toEqual([]);
    expect(Object.keys(usePlanStore.getState().snapshots)).toHaveLength(3);
  });

  it('writes a bill into both the live plan and the closed month', () => {
    const plan = prdExamplePlan();
    usePlanStore.setState({ plan });
    usePlanStore.getState().saveSnapshot('2026-08', NOW);
    const before = usePlanStore.getState().snapshots['2026-08'];
    const variable = plan.expenses.find((e) => !e.fixed)!;
    usePlanStore.getState().setExpenseActual(variable.id, '2026-08', variable.amount + 300);
    const { plan: live, snapshots } = usePlanStore.getState();
    expect(live.expenses.find((e) => e.id === variable.id)!.actuals).toEqual({ '2026-08': variable.amount + 300 });
    const after = snapshots['2026-08'];
    expect(after.plan!.expenses.find((e) => e.id === variable.id)!.actuals).toEqual({ '2026-08': variable.amount + 300 });
    expect(after.actualVariance).toBe(300);
    expect(after.savedAt).toBe(before.savedAt);
  });

  it('loading the demo clears history', () => {
    usePlanStore.setState({ plan: prdExamplePlan() });
    usePlanStore.getState().saveSnapshot('2026-08', NOW);
    usePlanStore.getState().loadSample();
    expect(usePlanStore.getState().snapshots).toEqual({});
  });
});

describe('plan files', () => {
  it('round-trips a v2 file with its snapshots', () => {
    const plan = prdExamplePlan();
    usePlanStore.setState({ plan });
    usePlanStore.getState().saveSnapshot('2026-08', NOW);
    const text = serializePlanFile(usePlanStore.getState());
    const parsed = parsePlanFile(text);
    expect(parsed.plan.income).toHaveLength(plan.income.length);
    expect(parsed.snapshots['2026-08'].plan?.expenses).toHaveLength(plan.expenses.length);
    usePlanStore.getState().reset();
    usePlanStore.getState().importPlan(parsed);
    expect(Object.keys(usePlanStore.getState().snapshots)).toEqual(['2026-08']);
  });

  it('still reads a v1 file that held the plan alone', () => {
    const parsed = parsePlanFile(JSON.stringify(prdExamplePlan()));
    expect(parsed.plan.userName).toBe('Test');
    expect(parsed.snapshots).toEqual({});
  });

  it('drops malformed snapshot entries and rejects other JSON', () => {
    const file = {
      version: 2,
      plan: prdExamplePlan(),
      snapshots: {
        nope: { income: 1 },
        '2026-08': { income: 'x' },
        '2026-07': { income: 1, lifestyleCost: 2, plan: { junk: true } },
      },
    };
    const parsed = parsePlanFile(JSON.stringify(file));
    expect(Object.keys(parsed.snapshots)).toEqual(['2026-07']);
    expect(parsed.snapshots['2026-07'].plan).toBeUndefined();
    expect(() => parsePlanFile('{"hello":1}')).toThrow('Not a Finly plan file');
    expect(() => parsePlan({ version: 1 })).toThrow();
  });
});

describe('persist migration', () => {
  it('loads state written before history existed', async () => {
    const plan = prdExamplePlan();
    const old = {
      month: '2026-08',
      savedAt: NOW.toISOString(),
      income: 1,
      lifestyleCost: 2,
      savings: 0,
      breathingRoom: 0,
      safeToSpend: 0,
      totalAssets: 0,
      cashInBank: 0,
      investments: 0,
      savingsRate: 0,
      byCategory: {},
    };
    memory.setItem('finly.plan.v1', JSON.stringify({ state: { plan, snapshots: { '2026-08': old } }, version: 0 }));
    vi.resetModules();
    const fresh = await import('../planStore');
    const s = fresh.usePlanStore.getState();
    expect(s.plan.userName).toBe('Test');
    expect(s.snapshots['2026-08'].plan).toBeUndefined();
    expect(s.hydrated).toBe(true);
  });
});

describe('profile picture', () => {
  it('stores a picture on the plan, bumps updatedAt, and removes it again', () => {
    const before = usePlanStore.getState().plan.updatedAt;
    usePlanStore.getState().setAvatar('data:image/jpeg;base64,AAAA');
    const plan = usePlanStore.getState().plan;
    expect(plan.avatar).toBe('data:image/jpeg;base64,AAAA');
    expect(plan.updatedAt >= before).toBe(true);
    usePlanStore.getState().setAvatar(undefined);
    expect(usePlanStore.getState().plan.avatar).toBeUndefined();
  });
});
