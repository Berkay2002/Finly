import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../metrics';
import { emptyPlan } from '../types';
import { expense, income, NOW, prdExamplePlan } from './fixtures';

describe('computeMetrics — PRD worked example', () => {
  const m = computeMetrics(prdExamplePlan(), NOW);

  it('splits reliable and variable income (§5, §18.13)', () => {
    expect(m.income.reliable).toBe(31500);
    expect(m.income.variable).toBe(4500);
    expect(m.income.total).toBe(36000);
  });

  it('computes lifestyle cost from monthly equivalents, excluding items included elsewhere (§15, §6)', () => {
    expect(m.lifestyleCost).toBe(25200);
    expect(m.expenses.lines.find((l) => l.id === 'water')).toBeUndefined();
  });

  it('sums by category', () => {
    expect(m.expenses.byCategory.home).toBe(9000);
    expect(m.expenses.byCategory.living).toBe(6100);
    expect(m.expenses.byCategory.transport).toBe(5450);
    expect(m.expenses.byCategory.finance).toBe(1500);
    expect(m.expenses.byCategory.leisure).toBe(1650);
    expect(m.expenses.byCategory.planned).toBe(1500);
  });

  it('computes essential cost (§15)', () => {
    // rent 8500 + electricity 500 + groceries 4000 + car finance 3200 + fuel 1200 + car insurance 800 + tax 250 + loan 1500
    expect(m.essentialCost).toBe(19950);
    expect(m.expenses.optional).toBe(25200 - 19950);
  });

  it('computes committed vs flexible (§18.4)', () => {
    // committed: rent, electricity, car finance, car insurance, tax, loan = 8500+500+3200+800+250+1500
    expect(m.expenses.committed).toBe(14750);
    expect(m.expenses.flexible).toBe(25200 - 14750);
  });

  it('separates planned future spending from long-term wealth (§2.4)', () => {
    expect(m.savings.longTerm).toBe(5000);
    expect(m.savings.futureSpending).toBe(1000);
    expect(m.savings.total).toBe(6000);
  });

  it('computes planned cost, breathing room and unallocated money (§15, §18.12, §18.24)', () => {
    expect(m.plannedCost).toBe(31200);
    expect(m.breathingRoom).toBe(4800);
  });

  it('savings rate is against total and reliable income (§18.7)', () => {
    expect(m.savings.rate).toBeCloseTo(6000 / 36000, 5);
    expect(m.savings.rateOfReliable).toBeCloseTo(6000 / 31500, 5);
  });

  it('allocation splits income between today and the future (§18.27)', () => {
    expect(m.allocation.lifestyle).toBeCloseTo(0.7, 3);
    expect(m.allocation.futureSpending).toBeCloseTo(1000 / 36000, 5);
    expect(m.allocation.longTerm).toBeCloseTo(5000 / 36000, 5);
    expect(m.allocation.unallocated).toBeCloseTo(4800 / 36000, 5);
  });

  it('keeps spendable money separate from savings, emergency and investments (§13, §19)', () => {
    expect(m.position.everyday).toBe(18500);
    expect(m.position.cashSavings).toBe(72000);
    expect(m.position.cashInBank).toBe(90500);
    expect(m.position.emergency).toBe(40000);
    expect(m.position.investments).toBe(110000);
    expect(m.position.totalAssets).toBe(240500);
  });

  it('computes resilience and runways (§18.25, §18.26)', () => {
    expect(m.resilience.emergencyMonths).toBeCloseTo(40000 / 19950, 4);
    expect(m.resilience.availableForRunway).toBe(130500);
    expect(m.resilience.essentialRunwayMonths).toBeCloseTo(130500 / 19950, 4);
    expect(m.resilience.lifestyleRunwayMonths).toBeCloseTo(130500 / 25200, 4);
    expect(m.resilience.reliableCoversEssentials).toBe(true);
    expect(m.resilience.essentialMargin).toBe(31500 - 19950);
  });

  it('ranks the largest costs with annual equivalents (§18.3, §18.23)', () => {
    expect(m.topCosts[0]).toMatchObject({ name: 'Rent', monthly: 8500, annual: 102000 });
    expect(m.topCosts[1]).toMatchObject({ name: 'Groceries', monthly: 4000 });
    expect(m.topCosts[2]).toMatchObject({ name: 'Car finance', monthly: 3200 });
  });

  it('combines subscription costs (§18.22)', () => {
    expect(m.subscriptions.monthly).toBe(1200);
    expect(m.subscriptions.annual).toBe(14400);
  });

  it('computes the true monthly car cost (§8, §18.21)', () => {
    expect(m.car.monthly).toBe(3200 + 1200 + 800 + 250);
    expect(m.car.annual).toBe((3200 + 1200 + 800 + 250) * 12);
  });

  it('lists reducible spending as optional and flexible items, largest first (§18.15)', () => {
    expect(m.reducible.map((l) => l.name)).toEqual([
      'Restaurants',
      'Holiday',
      'Gym',
      'Christmas',
      'Hobbies',
      'Streaming',
    ]);
  });

  it('gives a daily allowance based on flexible money and days remaining (§18.18)', () => {
    expect(m.daily.daysInMonth).toBe(30);
    expect(m.daily.daysRemaining).toBe(15);
    expect(m.daily.flexibleBudget).toBe(25200 - 14750 + 4800);
    expect(m.daily.perDay).toBeCloseTo(m.daily.flexibleBudget / 30, 5);
    expect(m.daily.remaining).toBeCloseTo(m.daily.flexibleBudget / 2, 5);
  });
});

describe('computeMetrics — edge cases', () => {
  it('handles an empty plan without NaN', () => {
    const m = computeMetrics(emptyPlan(NOW), NOW);
    expect(m.income.total).toBe(0);
    expect(m.lifestyleCost).toBe(0);
    expect(m.breathingRoom).toBe(0);
    expect(m.savings.rate).toBe(0);
    expect(m.allocation.lifestyle).toBe(0);
    expect(m.resilience.emergencyMonths).toBe(0);
    expect(m.hasIncome).toBe(false);
  });

  it('reports infinite runway when there is money but no costs', () => {
    const plan = emptyPlan(NOW);
    plan.accounts = [{ id: 'a', name: 'Savings', kind: 'savings', balance: 1000 }];
    const m = computeMetrics(plan, NOW);
    expect(m.resilience.essentialRunwayMonths).toBe(Infinity);
  });

  it('excludes income not marked for the baseline (§5)', () => {
    const plan = emptyPlan(NOW);
    plan.income = [
      income({ id: 'a', amount: 30000 }),
      income({ id: 'b', amount: 5000, reliability: 'variable', includeInBaseline: false }),
    ];
    const m = computeMetrics(plan, NOW);
    expect(m.income.total).toBe(30000);
    expect(m.income.excluded).toBe(5000);
  });

  it('flags when essential costs depend on variable income (§18.14)', () => {
    const plan = emptyPlan(NOW);
    plan.income = [
      income({ id: 'a', amount: 28000 }),
      income({ id: 'b', amount: 5000, reliability: 'variable' }),
    ];
    plan.expenses = [expense({ name: 'Rent', amount: 30500, category: 'home' })];
    const m = computeMetrics(plan, NOW);
    expect(m.resilience.reliableCoversEssentials).toBe(false);
    expect(m.resilience.essentialMargin).toBe(-2500);
  });

  it('safe to spend subtracts one-off costs dated in the current month (§18.1)', () => {
    const plan = emptyPlan(NOW);
    plan.income = [income({ amount: 30000 })];
    plan.expenses = [
      expense({ name: 'Rent', amount: 10000, category: 'home' }),
      expense({
        name: 'New sofa',
        amount: 6000,
        category: 'planned',
        frequency: 'once',
        nextDate: '2026-09-25',
        essential: false,
        committed: false,
      }),
      expense({
        name: 'Bike',
        amount: 5000,
        category: 'planned',
        frequency: 'once',
        nextDate: '2026-11-02',
        essential: false,
        committed: false,
      }),
    ];
    const m = computeMetrics(plan, NOW);
    // lifestyle = 10000 + 6000/12 + 5000/12
    expect(m.lifestyleCost).toBeCloseTo(10000 + 500 + 416.67, 1);
    expect(m.oneOffsThisMonth).toBe(6000);
    expect(m.safeToSpend).toBeCloseTo(m.breathingRoom - 6000, 5);
  });
});
