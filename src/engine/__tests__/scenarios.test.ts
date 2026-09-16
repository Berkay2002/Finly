import { describe, expect, it } from 'vitest';
import { applyScenario, runScenario } from '../scenarios';
import { NOW, prdExamplePlan } from './fixtures';

describe('add recurring expense (§18.19, §23)', () => {
  it('shows the consequence on breathing room without judging', () => {
    const r = runScenario(
      prdExamplePlan(),
      {
        type: 'add_expense',
        name: 'Car payment',
        amount: 4000,
        frequency: 'monthly',
        category: 'transport',
        essential: true,
        committed: true,
      },
      NOW,
    );
    expect(r.before.breathingRoom).toBe(4800);
    expect(r.after.breathingRoom).toBe(800);
    const br = r.deltas.find((x) => x.key === 'breathingRoom')!;
    expect(br.delta).toBe(-4000);
    expect(r.savingsShortfall).toBe(0);
    expect(r.goals.every((g) => g.delayMonths === 0)).toBe(true);
  });

  it('delays goals when breathing room goes negative', () => {
    const r = runScenario(
      prdExamplePlan(),
      {
        type: 'add_expense',
        name: 'Big car',
        amount: 7800,
        frequency: 'monthly',
        category: 'transport',
        essential: false,
        committed: true,
      },
      NOW,
    );
    expect(r.after.breathingRoom).toBe(-3000);
    expect(r.savingsShortfall).toBe(3000);
    const car = r.goals.find((g) => g.goal.id === 'g3')!;
    expect(car.delayMonths).toBeGreaterThan(0);
  });

  it('converts yearly amounts to monthly equivalents', () => {
    const r = runScenario(
      prdExamplePlan(),
      { type: 'add_expense', name: 'X', amount: 12000, frequency: 'yearly', category: 'leisure', essential: false, committed: false },
      NOW,
    );
    expect(r.after.lifestyleCost - r.before.lifestyleCost).toBe(1000);
  });
});

describe('income change (§18.20)', () => {
  it('applies a percentage to one source', () => {
    const plan = applyScenario(prdExamplePlan(), { type: 'income_change', sourceId: 'salary', mode: 'percent', value: 10 });
    expect(plan.income.find((i) => i.id === 'salary')!.amount).toBeCloseTo(34650, 5);
  });

  it('applies an absolute monthly change respecting the source frequency', () => {
    const base = prdExamplePlan();
    base.income[0].frequency = 'yearly';
    base.income[0].amount = 120000; // 10,000 / month
    const plan = applyScenario(base, { type: 'income_change', sourceId: 'salary', mode: 'absolute', value: -1000 });
    expect(plan.income[0].amount).toBeCloseTo(108000, 5);
  });

  it('removes a source (loss of employment)', () => {
    const r = runScenario(prdExamplePlan(), { type: 'income_change', sourceId: 'salary', mode: 'remove', value: 0 }, NOW);
    expect(r.after.income.total).toBe(4500);
    expect(r.after.resilience.reliableCoversEssentials).toBe(false);
  });

  it('sets a source to a monthly value', () => {
    const plan = applyScenario(prdExamplePlan(), { type: 'income_change', sourceId: 'salary', mode: 'set', value: 28000 });
    expect(plan.income.find((i) => i.id === 'salary')!.amount).toBe(28000);
  });

  it('applies to all baseline income when no source is given', () => {
    const r = runScenario(prdExamplePlan(), { type: 'income_change', mode: 'percent', value: -20 }, NOW);
    expect(r.after.income.total).toBeCloseTo(36000 * 0.8, 5);
  });

  it('never mutates the original plan', () => {
    const plan = prdExamplePlan();
    const before = JSON.stringify(plan);
    runScenario(plan, { type: 'income_change', mode: 'remove', value: 0 }, NOW);
    runScenario(plan, { type: 'add_expense', name: 'X', amount: 1, frequency: 'monthly', category: 'home', essential: true, committed: true }, NOW);
    expect(JSON.stringify(plan)).toBe(before);
  });
});

describe('add recurring expense with a range', () => {
  it('budgets for the typical amount and widens the band', () => {
    const r = runScenario(
      prdExamplePlan(),
      {
        type: 'add_expense',
        name: 'Heat pump electricity',
        amount: 1000,
        range: { low: 600, high: 1800 },
        frequency: 'monthly',
        category: 'home',
        essential: true,
        committed: true,
      },
      NOW,
    );
    expect(r.after.breathingRoom).toBe(3800);
    expect(r.after.range.breathingRoom.low).toBe(r.before.range.breathingRoom.low - 1800);
    expect(r.after.range.breathingRoom.high).toBe(r.before.range.breathingRoom.high - 600);
  });
});
