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

describe('computeMetrics — variable costs with a range', () => {
  it('budgets for the typical amount, so headline totals are unchanged by a range', () => {
    const m = computeMetrics(prdExamplePlan(), NOW);
    expect(m.lifestyleCost).toBe(25200);
    expect(m.range.hasRanges).toBe(true);
  });

  it('reports the cheapest and most expensive normal month', () => {
    const m = computeMetrics(prdExamplePlan(), NOW);
    // electricity 300–900 (typical 500), fuel 900–1600 (typical 1200)
    expect(m.range.lifestyleCost).toEqual({ low: 25200 - 200 - 300, high: 25200 + 400 + 400 });
    expect(m.range.swing).toBe(1300);
    expect(m.range.essentialCost).toEqual({ low: 19950 - 500, high: 19950 + 800 });
    expect(m.range.byCategory.home).toEqual({ low: 8800, high: 9400 });
    expect(m.range.byCategory.finance).toEqual({ low: 1500, high: 1500 });
  });

  it('gives breathing room and safe to spend as a band', () => {
    const m = computeMetrics(prdExamplePlan(), NOW);
    expect(m.range.breathingRoom).toEqual({ low: 4800 - 800, high: 4800 + 500 });
    expect(m.range.safeToSpend).toEqual({ low: 4000, high: 5300 });
  });

  it('marks the lines that vary with their monthly bounds', () => {
    const m = computeMetrics(prdExamplePlan(), NOW);
    const el = m.expenses.lines.find((l) => l.id === 'electricity')!;
    expect(el).toMatchObject({ monthly: 500, monthlyLow: 300, monthlyHigh: 900, varies: true });
    const rent = m.expenses.lines.find((l) => l.id === 'rent')!;
    expect(rent).toMatchObject({ monthly: 8500, monthlyLow: 8500, monthlyHigh: 8500, varies: false });
  });

  it('collapses to a single figure when nothing varies', () => {
    const plan = emptyPlan(NOW);
    plan.income = [income({ amount: 30000 })];
    plan.expenses = [expense({ name: 'Rent', amount: 10000, category: 'home' })];
    const m = computeMetrics(plan, NOW);
    expect(m.range.hasRanges).toBe(false);
    expect(m.range.lifestyleCost).toEqual({ low: 10000, high: 10000 });
    expect(m.range.breathingRoom).toEqual({ low: 20000, high: 20000 });
  });

  it('counts an item entered as a range only, budgeting for the midpoint', () => {
    const plan = emptyPlan(NOW);
    plan.income = [income({ amount: 30000 })];
    plan.expenses = [
      expense({ name: 'Electricity', amount: 0, category: 'home', fixed: false, range: { low: 300, high: 900 } }),
    ];
    const m = computeMetrics(plan, NOW);
    expect(m.lifestyleCost).toBe(600);
    expect(m.range.lifestyleCost).toEqual({ low: 300, high: 900 });
  });
});

describe('computeMetrics — confirming bills for the month', () => {
  it('lists variable monthly items as pending until their bill is entered', () => {
    const m = computeMetrics(prdExamplePlan(), NOW);
    expect(m.actuals.month).toBe('2026-09');
    expect(m.actuals.pending.map((p) => p.id).sort()).toEqual(
      ['electricity', 'fuel', 'groceries', 'hobbies', 'restaurants'].sort(),
    );
    expect(m.actuals.confirmed).toEqual([]);
    expect(m.actuals.variance).toBe(0);
    expect(m.actuals.lifestyleCost).toBe(25200);
    expect(Object.values(m.actuals.byCategory).reduce((a, b) => a + b, 0)).toBeCloseTo(m.actuals.lifestyleCost - m.debt.monthly, 6);
  });

  it('runs the month on the real figure once a bill is confirmed', () => {
    const plan = prdExamplePlan();
    const el = plan.expenses.find((e) => e.id === 'electricity')!;
    el.actuals = { '2026-09': 820 };
    const m = computeMetrics(plan, NOW);
    expect(m.actuals.confirmed).toHaveLength(1);
    expect(m.actuals.confirmed[0]).toMatchObject({ id: 'electricity', actual: 820, variance: 320 });
    expect(m.actuals.pending.find((p) => p.id === 'electricity')).toBeUndefined();
    expect(m.actuals.variance).toBe(320);
    expect(m.actuals.lifestyleCost).toBe(25200 + 320);
    // Baseline plan is untouched; only this month's spendable money moves.
    expect(m.lifestyleCost).toBe(25200);
    expect(m.breathingRoom).toBe(4800);
    expect(m.safeToSpend).toBe(4800 - 320);
  });

  it('fixes a confirmed bill at its actual inside the safe-to-spend band', () => {
    const plan = prdExamplePlan();
    plan.expenses.find((e) => e.id === 'electricity')!.actuals = { '2026-09': 820 };
    const m = computeMetrics(plan, NOW);
    // Electricity no longer spreads 300–900; only fuel (900–1600 around 1200) still does.
    expect(m.range.safeToSpend).toEqual({ low: 4800 - 320 - 400, high: 4800 - 320 + 300 });
  });

  it('keeps bills with the month they are paid in', () => {
    const plan = prdExamplePlan();
    plan.expenses.find((e) => e.id === 'electricity')!.actuals = { '2026-08': 700 };
    const m = computeMetrics(plan, NOW);
    expect(m.actuals.confirmed).toEqual([]);
    expect(m.safeToSpend).toBe(4800);
    const aug = computeMetrics(plan, new Date(2026, 7, 10));
    expect(aug.actuals.confirmed[0]).toMatchObject({ id: 'electricity', actual: 700, variance: 200 });
  });

  it('names the period a lagged bill covers', () => {
    const plan = prdExamplePlan();
    plan.expenses.find((e) => e.id === 'electricity')!.billingLag = 1;
    const m = computeMetrics(plan, NOW);
    const el = m.actuals.pending.find((p) => p.id === 'electricity')!;
    expect(el.periodMonth).toBe('2026-08');
    expect(el.billingLag).toBe(1);
    const jan = computeMetrics(plan, new Date(2027, 0, 5)).actuals.pending.find((p) => p.id === 'electricity')!;
    expect(jan.periodMonth).toBe('2026-12');
  });

  it('does not ask for bills on fixed, irregular or bundled items', () => {
    const plan = emptyPlan(NOW);
    plan.income = [income({ amount: 30000 })];
    plan.expenses = [
      expense({ name: 'Rent', amount: 10000, category: 'home' }),
      expense({ name: 'Vehicle tax', amount: 3000, category: 'transport', frequency: 'yearly', fixed: false }),
      expense({ name: 'Water', amount: 300, category: 'home', fixed: false, includedElsewhere: true }),
    ];
    const m = computeMetrics(plan, NOW);
    expect(m.actuals.pending).toEqual([]);
  });
});

describe('money set aside for quarterly and yearly bills', () => {
  const plan = () => {
    const p = emptyPlan(NOW);
    p.expenses = [
      expense({ id: 'tax', name: 'Vehicle tax', category: 'transport', amount: 2400, frequency: 'yearly', nextDate: '2027-03-10' }),
      expense({ id: 'fuel', name: 'Fuel', category: 'transport', amount: 1000 }),
    ];
    p.debts = [
      { id: 'csn', name: 'CSN', kind: 'csn', csnType: 'annuity', balance: 440_000, rate: 2.135, payment: 4407, frequency: 'quarterly', nextDate: '2027-02-26' },
    ];
    return p;
  };

  it('holds a bill back before its due month and pays it in the due month', () => {
    const jan = computeMetrics(plan(), new Date(2027, 0, 10));
    expect(jan.expenses.byCategory.transport).toBe(1200);
    expect(jan.expenses.byCategoryHeld.transport).toBe(200);
    expect(jan.expenses.lines.find((l) => l.id === 'tax')!.lump).toMatchObject({ amount: 2400, paidThisMonth: false });
    expect(jan.expenses.lines.find((l) => l.id === 'fuel')!.lump).toBeUndefined();
    expect(jan.debt.monthly).toBeCloseTo(4407 / 3, 5);
    expect(jan.debt.held).toBeCloseTo(4407 / 3, 5);
    expect(jan.debt.lines[0].lump).toMatchObject({ amount: 4407, paidThisMonth: false, part: 2, of: 3 });

    const mar = computeMetrics(plan(), new Date(2027, 2, 10));
    expect(mar.expenses.byCategoryHeld.transport).toBe(0);
    expect(mar.expenses.lines.find((l) => l.id === 'tax')!.lump).toMatchObject({ paidThisMonth: true, part: 12, of: 12 });

    const feb = computeMetrics(plan(), new Date(2027, 1, 10));
    expect(feb.debt.held).toBe(0);
    expect(feb.debt.lines[0].lump).toMatchObject({ paidThisMonth: true, part: 3, of: 3 });
  });

  it('charges no loan payment before the first covered month', () => {
    const nov = computeMetrics(plan(), new Date(2026, 10, 10));
    expect(nov.debt.monthly).toBe(0);
    expect(nov.debt.held).toBe(0);
    expect(nov.debt.lines[0].lump).toBeUndefined();
  });
});

describe("money lent out", () => {
  it("is owned, not spent", () => {
    const plan = prdExamplePlan();
    const base = computeMetrics(plan, NOW).position;
    plan.bank = { provider: "p", appId: "x", sessions: [], lentOut: 500 };
    const p = computeMetrics(plan, NOW).position;
    expect(p.lentOut).toBe(500);
    expect(p.totalOwned).toBe(base.totalOwned + 500);
    expect(p.netWorth).toBe(base.netWorth + 500);
  });
});

describe("a one-off, such as a gift", () => {
  it("counts whole in its month, once, and is history after", () => {
    const base = computeMetrics(prdExamplePlan(), NOW);
    const gift = expense({ id: "gift", name: "Gift to Anna", category: "planned", subcategory: "gifts", amount: 1000, fixed: true, frequency: "once", nextDate: "2026-09-12", actuals: { "2026-09": 1000 } });
    const plan = prdExamplePlan();
    plan.expenses.push(gift);
    const m = computeMetrics(plan, NOW);
    expect(m.oneOffsThisMonth).toBe(base.oneOffsThisMonth + 1000);
    expect(m.safeToSpend).toBeCloseTo(base.safeToSpend - 1000 - 1000 / 12, 5);
    expect(m.actuals.byCategory.planned).toBeCloseTo(base.actuals.byCategory.planned + 1000, 5);
    const later = computeMetrics(plan, new Date(2026, 9, 16));
    const baseLater = computeMetrics(prdExamplePlan(), new Date(2026, 9, 16));
    expect(later.lifestyleCost).toBe(baseLater.lifestyleCost);
    expect(later.oneOffsThisMonth).toBe(baseLater.oneOffsThisMonth);
  });
});

describe('computeMetrics — an item that may be nothing at all, while the bank feeds its group', () => {
  it('counts fuel from 0 only once transport spending passes the travel card', () => {
    const plan = emptyPlan(NOW);
    plan.income = [income({ amount: 30000 })];
    plan.expenses = [
      expense({ id: 'sl', name: 'SL card', amount: 490, category: 'transport', subcategory: 'travel_card' }),
      expense({ id: 'fuel', name: 'Fuel', amount: 0, category: 'transport', subcategory: 'fuel', fixed: false, range: { low: 0, high: 600 } }),
    ];
    expect(computeMetrics(plan, NOW).expenses.byCategory.transport).toBe(790);
    expect(computeMetrics(plan, NOW).actuals.byCategory.transport).toBe(790);
    plan.everydaySpend = { transport: { '2026-09': { amount: 0, asOf: '2026-09-16', source: 'bank' } } };
    expect(computeMetrics(plan, NOW).actuals.byCategory.transport).toBe(490);
    plan.everydaySpend = { transport: { '2026-09': { amount: 700, asOf: '2026-09-16', source: 'bank' } } };
    expect(computeMetrics(plan, NOW).actuals.byCategory.transport).toBe(700);
  });
});

describe('computeMetrics — a bill that may be nothing at all, once the bank has seen it', () => {
  it('counts electronics as nothing until a line shows, then as what was paid', () => {
    const plan = emptyPlan(NOW);
    plan.income = [income({ amount: 30000 })];
    plan.bank = { provider: 'p', appId: 'x', sessions: [{ id: 's', aspsp: 'SEB', country: 'SE', validUntil: '2027-01-01', accounts: {} }] };
    const item = expense({ id: 'gear', name: 'Electronics', amount: 0, category: 'planned', subcategory: 'electronics', frequency: 'monthly', fixed: false, range: { low: 0, high: 1000 } });
    plan.expenses = [item];
    expect(computeMetrics(plan, NOW).actuals.byCategory.planned).toBe(500);
    plan.expenses = [{ ...item, bankMatch: { counterparty: 'CLAS OHLSON' } }];
    expect(computeMetrics(plan, NOW).actuals.byCategory.planned).toBe(0);
    expect(computeMetrics(plan, NOW).actuals.pending.map((p) => p.id)).toEqual(['gear']);
    plan.expenses = [{ ...item, bankMatch: { counterparty: 'CLAS OHLSON' }, actuals: { '2026-09': 350 } }];
    expect(computeMetrics(plan, NOW).actuals.byCategory.planned).toBe(350);
    plan.expenses = [item];
    plan.bank.lines = { l1: { expenseId: 'gear' } };
    expect(computeMetrics(plan, NOW).actuals.byCategory.planned).toBe(0);
  });
});
