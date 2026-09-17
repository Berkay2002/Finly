import { addMonths } from 'date-fns';
import { describe, expect, it } from 'vitest';
import { computeMetrics, monthKeyOf } from '../metrics';
import { projectPlan } from '../projections';
import { purchaseImpact } from '../scenarios';
import type { FinancialPlan } from '../types';
import { NOW, prdExamplePlan } from './fixtures';

/**
 * A connected account's balance jumps by the salary the day it is paid. The salary is also in the
 * plan as expected income. These pin down that the two are never added together: what is in the
 * account is money held, what is in the plan is a monthly flow, and the month being lived is not
 * projected at all.
 */
describe('a salary already in the bank balance is not counted twice', () => {
  const SALARY = 31500;
  const paid = (plan: FinancialPlan): FinancialPlan => ({
    ...plan,
    accounts: plan.accounts.map((a) =>
      a.id === 'a1' ? { ...a, balance: a.balance + SALARY, bank: { provider: 'enable-banking', externalId: 'hash' } } : a,
    ),
  });

  it('leaves the budget for the month exactly where it was', () => {
    const before = computeMetrics(prdExamplePlan(), NOW);
    const after = computeMetrics(paid(prdExamplePlan()), NOW);
    expect(after.safeToSpend).toBe(before.safeToSpend);
    expect(after.breathingRoom).toBe(before.breathingRoom);
    expect(after.income).toEqual(before.income);
    expect(after.position.cashInBank).toBe(before.position.cashInBank + SALARY);
  });

  it('adds nothing to the current month and carries the same difference through every later one', () => {
    expect(projectPlan(paid(prdExamplePlan()), NOW, NOW).accounts.find((a) => a.id === 'a1')!.balance).toBe(18500 + SALARY);
    for (const n of [1, 6, 12]) {
      const to = addMonths(NOW, n);
      const landing = (plan: FinancialPlan) => projectPlan(plan, NOW, to).accounts.find((a) => a.id === 'a1')!;
      expect(landing(paid(prdExamplePlan())).balance - landing(prdExamplePlan()).balance).toBeCloseTo(SALARY, 6);
      expect(landing(paid(prdExamplePlan())).balances?.[monthKeyOf(NOW)]).toBe(18500 + SALARY);
    }
  });

  it('weighs a purchase against the money actually there', () => {
    const purchase = { amount: 10000, date: addMonths(NOW, 2) };
    const before = purchaseImpact(prdExamplePlan(), purchase, NOW);
    const after = purchaseImpact(paid(prdExamplePlan()), purchase, NOW);
    expect(after.landingNow - before.landingNow).toBeCloseTo(SALARY, 6);
  });
});
