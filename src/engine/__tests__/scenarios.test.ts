import { describe, expect, it } from 'vitest';
import { applyScenario, homeBuyingCosts, installment, maxAffordablePrice, mortgageMonthly, propertyFee, purchaseImpact, runScenario, suggestedDownPayment } from '../scenarios';
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

describe('one-off purchase', () => {
  it('takes a small purchase off the landing account without a shortfall', () => {
    const r = purchaseImpact(prdExamplePlan(), { amount: 5000, date: NOW }, NOW);
    expect(r.landingBefore).toBe(18500);
    expect(r.landingAfter).toBe(13500);
    expect(r.shortBy).toBe(0);
    expect(r.earliest?.getMonth()).toBe(NOW.getMonth());
    expect(r.runwayAfter).toBeLessThan(r.runwayBefore);
    // Room does not depend on the amount tested.
    expect(r.room).toBe(purchaseImpact(prdExamplePlan(), { amount: 0, date: NOW }, NOW).room);
  });

  it('shows the shortfall now and a later month it fits', () => {
    const r = purchaseImpact(prdExamplePlan(), { amount: 40000, date: NOW }, NOW);
    expect(r.shortBy).toBeGreaterThan(0);
    expect(r.earliest!.getTime()).toBeGreaterThan(r.month.getTime());
    const later = purchaseImpact(prdExamplePlan(), { amount: 40000, date: r.earliest! }, NOW);
    expect(later.shortBy).toBe(0);
  });

  it('finds no month when it never fits within five years', () => {
    expect(purchaseImpact(prdExamplePlan(), { amount: 10_000_000, date: NOW }, NOW).earliest).toBeNull();
  });
});

describe('installment', () => {
  it('splits evenly without interest', () => {
    expect(installment(12000, 12, 0)).toEqual({ monthly: 1000, total: 12000, extra: 0 });
  });

  it('pays an annuity with interest and fees', () => {
    const r = installment(12000, 12, 12, 195, 29);
    expect(r.monthly).toBeCloseTo(1066.19 + 29, 2);
    expect(r.total).toBeCloseTo((1066.19 + 29) * 12 + 195, 0);
    expect(r.extra).toBeCloseTo(r.total - 12000, 6);
  });
});

describe('down payment', () => {
  it('suggests what the account can spare, within the minimum and the price', () => {
    expect(suggestedDownPayment(18_560, 200_000, 0.2)).toBe(40_000);
    expect(suggestedDownPayment(58_560, 200_000, 0.2)).toBe(58_500);
    expect(suggestedDownPayment(300_000, 200_000, 0.2)).toBe(200_000);
    expect(suggestedDownPayment(0, 10_000)).toBe(0);
  });
});

describe('maxAffordablePrice', () => {
  const annuity = (loan: number) => installment(loan, 60, 6).monthly;

  it('is the cash plus the loan the monthly budget pays off', () => {
    const p = maxAffordablePrice({ cash: 50_000, budget: 3000, minShare: 0, loanMonthly: annuity });
    expect(annuity(p - 50_000)).toBeCloseTo(3000, 0);
  });

  it('is capped by the minimum down payment', () => {
    expect(maxAffordablePrice({ cash: 20_000, budget: 10_000, minShare: 0.2, loanMonthly: annuity })).toBe(100_000);
  });

  it('leaves room for upfront costs before the down payment', () => {
    const p = maxAffordablePrice({ cash: 20_000, budget: 10_000, minShare: 0.2, loanMonthly: annuity, upfront: () => 5000 });
    expect(p).toBe(75_000);
  });

  it('is 0 when nothing is left a month', () => {
    expect(maxAffordablePrice({ cash: 20_000, budget: -1, minShare: 0.2, loanMonthly: annuity })).toBe(0);
  });
});

describe('home purchase', () => {
  it('charges lagfart and new pantbrev on a house, nothing on a bostadsrätt', () => {
    expect(homeBuyingCosts(3_000_000, 2_700_000, true)).toBe(45_000 + 825 + 54_000 + 375);
    expect(homeBuyingCosts(3_000_000, 2_700_000, true, 3_000_000)).toBe(45_825);
    expect(homeBuyingCosts(3_000_000, 2_700_000, false)).toBe(0);
  });

  it('prices a mortgage as interest after deduction plus required amortisation', () => {
    const m = mortgageMonthly(2_700_000, 3_000_000, 3);
    expect(m.percent).toBe(2);
    expect(m.interest).toBe(6750);
    expect(m.amortization).toBe(4500);
    // 81 000 kr interest a year: 30 % back.
    expect(m.deduction).toBeCloseTo(2025, 6);
    expect(m.monthly).toBeCloseTo(6750 - 2025 + 4500, 6);
    expect(mortgageMonthly(1_000_000, 3_000_000, 3).percent).toBe(0);
  });

  it('charges a house 0.75 % of three quarters of the price, up to the cap', () => {
    expect(propertyFee(1_000_000)).toBe(5625);
    expect(propertyFee(5_000_000)).toBe(10_425);
  });
});
