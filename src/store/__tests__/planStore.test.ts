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

  it('writes a food total into both the live plan and the closed month, and clears it', () => {
    const plan = prdExamplePlan();
    plan.expenses.push(expense({ name: 'Groceries', subcategory: 'groceries', amount: 1000, frequency: 'weekly', fixed: false }));
    usePlanStore.setState({ plan });
    usePlanStore.getState().saveSnapshot('2026-08', NOW);
    const planned = usePlanStore.getState().snapshots['2026-08'].everydayPlanned!.food!;
    usePlanStore.getState().setEverydaySpend('food', '2026-08', { amount: planned + 250 });
    const { plan: live, snapshots } = usePlanStore.getState();
    expect(live.everydaySpend).toEqual({ food: { '2026-08': { amount: planned + 250 } } });
    expect(snapshots['2026-08'].everydaySpent).toEqual({ food: planned + 250 });
    expect(snapshots['2026-08'].actualVariance).toBeCloseTo(250, 6);

    usePlanStore.getState().setEverydaySpend('food', '2026-08', null);
    expect(usePlanStore.getState().plan.everydaySpend).toBeUndefined();
    expect(usePlanStore.getState().snapshots['2026-08'].everydaySpent).toEqual({});
  });

  it('keeps the date on a running total', () => {
    usePlanStore.setState({ plan: prdExamplePlan() });
    usePlanStore.getState().setEverydaySpend('transport', '2026-09', { amount: 1800, asOf: '2026-09-16' });
    expect(usePlanStore.getState().plan.everydaySpend).toEqual({ transport: { '2026-09': { amount: 1800, asOf: '2026-09-16' } } });
  });

  it('saves a commute and sets the items from it', () => {
    usePlanStore.setState({ plan: prdExamplePlan() });
    const prices = { lunch: 120, ticket: 0, card: 0, parking: 0, passage: 0 };
    usePlanStore.getState().setCommute({ people: [{ id: 'c1', name: 'You', days: 4, mode: 'active', buysLunch: true }] }, prices);
    const { plan } = usePlanStore.getState();
    expect(plan.commute?.people).toHaveLength(1);
    const lunches = plan.expenses.find((e) => e.subcategory === 'work_lunches')!;
    expect(lunches).toMatchObject({ amount: 120, occurrences: { times: 4, per: 'week' }, frequency: 'weekly' });
    expect(lunches.id).toMatch(/^exp/);
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

describe('loans', () => {
  it('records a loan balance under the current month', () => {
    const id = usePlanStore
      .getState()
      .addDebt({ name: 'CSN', kind: 'csn', balance: 200_000, payment: 4500, frequency: 'quarterly' });
    usePlanStore.getState().updateDebt(id, { balance: 196_000 });
    usePlanStore.getState().updateDebt(id, { lender: 'CSN' });
    const debt = usePlanStore.getState().plan.debts![0];
    expect(debt.balance).toBe(196_000);
    expect(debt.balances).toEqual({ [thisMonth]: 196_000 });
    usePlanStore.getState().removeDebt(id);
    expect(usePlanStore.getState().plan.debts).toEqual([]);
  });

  it('moves loan expenses into loans on import, but leaves closed months as they were', () => {
    usePlanStore.setState({ plan: prdExamplePlan() });
    usePlanStore.getState().saveSnapshot('2026-08', NOW);
    const data = { plan: usePlanStore.getState().plan, snapshots: usePlanStore.getState().snapshots };
    usePlanStore.getState().reset();
    usePlanStore.getState().importPlan(data);
    const s = usePlanStore.getState();
    expect(s.plan.debts?.map((d) => d.id)).toEqual(['debt_car_finance', 'debt_student_loan']);
    expect(s.plan.expenses.some((e) => e.tags.includes('debt'))).toBe(false);
    expect(s.snapshots['2026-08'].plan?.expenses.some((e) => e.id === 'car_finance')).toBe(true);
  });

  it('migrates a plan persisted before loans had their own model', async () => {
    memory.setItem('finly.plan.v1', JSON.stringify({ state: { plan: prdExamplePlan(), snapshots: {} }, version: 2 }));
    vi.resetModules();
    const fresh = await import('../planStore');
    const s = fresh.usePlanStore.getState();
    expect(s.plan.debts).toHaveLength(2);
    expect(s.plan.expenses.find((e) => e.id === 'student_loan')).toBeUndefined();
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

describe('electricity tariffs', () => {
  const tariff = { kwh: 400, energyPrice: 30, surcharge: 45, monthlyFee: 330 };

  it('recomputes the amount on save and passes usage to the other bill', () => {
    const store = usePlanStore.getState();
    const net = store.addExpense({ ...expense({ name: 'Elnät', amount: 0 }), id: undefined, tariff: { part: 'grid', ...tariff } });
    expect(usePlanStore.getState().plan.expenses[0]).toMatchObject({ amount: 630, fixed: false });

    const el = store.addExpense({
      ...expense({ name: 'Electricity', amount: 0 }),
      id: undefined,
      tariff: { part: 'supply', kwh: 400, energyPrice: 80, surcharge: 5, monthlyFee: 49 },
    });
    store.updateExpense(el, {
      tariff: { part: 'supply', kwh: 800, kwhHigh: 1500, energyPrice: 80, surcharge: 5, monthlyFee: 49 },
    });

    const byId = Object.fromEntries(usePlanStore.getState().plan.expenses.map((e) => [e.id, e]));
    expect(byId[el]).toMatchObject({ amount: 729, range: { low: 729, high: 1324 } });
    expect(byId[net].tariff).toMatchObject({ kwh: 800, kwhHigh: 1500 });
    expect(byId[net]).toMatchObject({ amount: 930, range: { low: 930, high: 1455 } });
  });
});
