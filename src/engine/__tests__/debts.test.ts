import { describe, expect, it } from 'vitest';
import {
  amortizationRequirement,
  csnIncomeBasedYearly,
  debtFlow,
  debtPayoff,
  debtSchedule,
  effectiveRate,
  interestBeforeRepayment,
  interestTaxReduction,
  isDeductible,
  migrateLegacyDebts,
  nextCsnDueDate,
  repaymentOrder,
  repaymentStart,
} from '../debts';
import { buildSnapshot } from '../history';
import { computeMetrics } from '../metrics';
import { upcomingExpenses } from '../projections';
import type { Debt } from '../types';
import { emptyPlan } from '../types';
import { expense, income, NOW, prdExamplePlan } from './fixtures';

function debt(partial: Partial<Debt> & { kind: Debt['kind'] }): Debt {
  return {
    id: partial.id ?? partial.kind,
    name: partial.name ?? partial.kind,
    balance: 0,
    payment: 0,
    frequency: 'monthly',
    ...partial,
  };
}

describe('security and ränteavdrag', () => {
  it('gives ränteavdrag only on secured loans, never on CSN', () => {
    expect(isDeductible({ kind: 'mortgage' })).toBe(true);
    expect(isDeductible({ kind: 'car', secured: true })).toBe(true);
    expect(isDeductible({ kind: 'car', secured: false })).toBe(false);
    expect(isDeductible({ kind: 'other', secured: true })).toBe(true);
    expect(isDeductible({ kind: 'personal', secured: true })).toBe(false);
    expect(isDeductible({ kind: 'credit_card' })).toBe(false);
    expect(isDeductible({ kind: 'csn', secured: true })).toBe(false);
  });

  it('reduces tax by 30 % up to 100 000 kr of interest and 21 % above', () => {
    expect(interestTaxReduction(50_000)).toBe(15_000);
    expect(interestTaxReduction(150_000)).toBe(30_000 + 10_500);
    expect(interestTaxReduction(-1)).toBe(0);
  });

  it('lowers the effective rate of deductible loans only', () => {
    expect(effectiveRate({ kind: 'mortgage', rate: 4 })).toBeCloseTo(2.8, 5);
    expect(effectiveRate({ kind: 'csn', rate: 2.135 })).toBe(2.135);
    expect(effectiveRate({ kind: 'car', secured: true })).toBeUndefined();
  });
});

describe('debtFlow', () => {
  it('pays a mortgage as amortering plus interest on the balance', () => {
    const f = debtFlow(debt({ kind: 'mortgage', balance: 2_000_000, rate: 3.6, amortization: 3333 }));
    expect(f.interest).toBeCloseTo(6000, 5);
    expect(f.principal).toBe(3333);
    expect(f.monthly).toBeCloseTo(9333, 5);
  });

  it('keeps a mortgage payment usable before the balance is known', () => {
    const f = debtFlow(debt({ kind: 'mortgage', payment: 7000, amortization: 2000 }));
    expect(f).toEqual({ monthly: 7000, interest: 5000, principal: 2000 });
  });

  it('splits an annuity payment into interest and repayment', () => {
    const f = debtFlow(debt({ kind: 'car', balance: 120_000, rate: 6, payment: 2500 }));
    expect(f.interest).toBeCloseTo(600, 5);
    expect(f.principal).toBeCloseTo(1900, 5);
  });

  it('spreads a quarterly CSN payment into a monthly figure', () => {
    const f = debtFlow(debt({ kind: 'csn', balance: 200_000, rate: 2.135, payment: 4500, frequency: 'quarterly' }));
    expect(f.monthly).toBe(1500);
    expect(f.interest).toBeCloseTo((200_000 * 0.02135) / 12, 5);
  });

  it('leaves the split unknown without a balance or rate', () => {
    expect(debtFlow(debt({ kind: 'personal', payment: 1000 }))).toEqual({ monthly: 1000, interest: null, principal: null });
  });
});

describe('debtPayoff', () => {
  it('pays off a straight-amortisation mortgage in balance ÷ amortering months', () => {
    const p = debtPayoff(debt({ kind: 'mortgage', balance: 120_000, rate: 3, amortization: 1000 }), NOW)!;
    expect(p.months).toBe(120);
    // interest = r × (120 000 + 119 000 + … + 1 000)
    expect(p.totalInterest).toBeCloseTo(0.0025 * 1000 * ((120 * 121) / 2), 3);
  });

  it('pays off an annuity on schedule', () => {
    const p = debtPayoff(debt({ kind: 'personal', balance: 10_000, rate: 12, payment: 888.49 }), NOW)!;
    expect(p.months).toBe(12);
    expect(p.date?.getFullYear()).toBe(2027);
  });

  it('never pays off when the payment only covers interest', () => {
    const p = debtPayoff(debt({ kind: 'credit_card', balance: 10_000, rate: 12, payment: 100 }), NOW)!;
    expect(p.months).toBe(Infinity);
    expect(p.totalInterest).toBeNull();
  });

  it('steps CSN annuity payments up about 2 % a year, finishing sooner than a flat payment', () => {
    const base = { balance: 200_000, rate: 2.135, payment: 1000 };
    const csn = debtPayoff(debt({ kind: 'csn', csnType: 'annuity', ...base }), NOW)!;
    const flat = debtPayoff(debt({ kind: 'other', ...base }), NOW)!;
    expect(csn.months).toBeLessThan(flat.months);
  });

  it('is unknown without a rate', () => {
    expect(debtPayoff(debt({ kind: 'car', balance: 50_000, payment: 1000 }), NOW)).toBeNull();
  });
});

describe('repayment not started yet', () => {
  // 16 Sep 2026: the first payment in February 2027 is more than a quarter away.
  const csn = (nextDate: string) =>
    debt({ kind: 'csn', csnType: 'annuity', balance: 440_000, rate: 2.135, payment: 4500, frequency: 'quarterly', nextDate });

  it('starts repayment at a due date more than one period away', () => {
    expect(repaymentStart(csn('2027-02-28'), NOW)).toEqual(new Date(2027, 1, 28));
    expect(repaymentStart(csn('2026-11-30'), NOW)).toBeNull();
    expect(repaymentStart(debt({ kind: 'csn', balance: 1, rate: 2, payment: 100 }), NOW)).toBeNull();
  });

  it('pays nothing before the first payment quarter and adds the interest to the debt', () => {
    const rows = debtSchedule(csn('2027-02-28'), NOW, 4);
    expect(rows.map((r) => r.payment)).toEqual([0, 0, 1500, 1500]);
    expect(rows[1].balance).toBeGreaterThan(440_000);
    // A payment due in November covers September to November, so it is paid from the start.
    expect(debtSchedule(csn('2026-11-30'), NOW, 1)[0].payment).toBe(1500);
  });

  it('finishes later and costs more interest than a loan already being repaid', () => {
    const later = debtPayoff(csn('2027-02-28'), NOW)!;
    const now = debtPayoff(csn('2026-11-30'), NOW)!;
    expect(later.months).toBeGreaterThan(now.months);
    expect(later.totalInterest!).toBeGreaterThan(now.totalInterest!);
  });

  it('adds up the interest until the first payment', () => {
    const r = 0.02135 / 12;
    expect(interestBeforeRepayment(csn('2027-02-28'), NOW)!.interest).toBeCloseTo(440_000 * ((1 + r) ** 5 - 1), 2);
    expect(interestBeforeRepayment(csn('2026-11-30'), NOW)).toBeNull();
  });
});

describe('amorteringskrav', () => {
  const mortgage = (balance: number, amortization = 0) =>
    debt({ kind: 'mortgage', balance, rate: 3, amortization, propertyValue: 3_000_000 });

  it('asks 2 % a year above 70 % loan-to-value', () => {
    const r = amortizationRequirement([mortgage(2_400_000, 3000)])!;
    expect(r.ltv).toBeCloseTo(0.8, 5);
    expect(r.percent).toBe(2);
    expect(r.monthly).toBeCloseTo(4000, 5);
    expect(r.short).toBe(true);
  });

  it('asks 1 % between 50 and 70 %, nothing at 50 % or below', () => {
    expect(amortizationRequirement([mortgage(1_800_000)])!.percent).toBe(1);
    expect(amortizationRequirement([mortgage(1_500_000)])!.percent).toBe(0);
  });

  it('adds up mortgages split into parts against the one home', () => {
    const parts = [mortgage(1_200_000, 2000), { ...mortgage(1_200_000, 2000), id: 'b', propertyValue: undefined }];
    const r = amortizationRequirement(parts)!;
    expect(r.ltv).toBeCloseTo(0.8, 5);
    expect(r.current).toBe(4000);
    expect(r.short).toBe(false);
  });
});

describe('CSN', () => {
  it('sets a 1989–2001 studielån at 4 % of income', () => {
    expect(csnIncomeBasedYearly(400_000)).toBe(16_000);
  });

  it('finds the next quarterly due date at the end of February, May, August or November', () => {
    expect(nextCsnDueDate(new Date(2026, 8, 16))).toBe('2026-11-30');
    expect(nextCsnDueDate(new Date(2026, 10, 30))).toBe('2026-11-30');
    expect(nextCsnDueDate(new Date(2026, 11, 1))).toBe('2027-02-28');
  });
});

describe('repaymentOrder', () => {
  const csn = debt({ id: 'csn', kind: 'csn', balance: 200_000, rate: 2.135 });
  const home = debt({ id: 'home', kind: 'mortgage', balance: 2_000_000, rate: 3.8 });
  const car = debt({ id: 'car', kind: 'car', secured: true, balance: 90_000, rate: 6.95 });
  const card = debt({ id: 'card', kind: 'credit_card', balance: 8000, rate: 19.9 });

  it('puts the most expensive debt first and CSN last', () => {
    expect(repaymentOrder([csn, home, car, card]).map((d) => d.id)).toEqual(['card', 'car', 'home', 'csn']);
  });

  it('keeps CSN last even when its rate is higher', () => {
    expect(repaymentOrder([{ ...csn, rate: 9 }, home]).map((d) => d.id)).toEqual(['home', 'csn']);
  });

  it('places a loan without a rate by what that kind usually costs', () => {
    expect(repaymentOrder([home, { ...card, rate: undefined }]).map((d) => d.id)).toEqual(['card', 'home']);
  });

  it('breaks near-ties by security: unsecured before secured', () => {
    const unsecuredCar = debt({ id: 'u', kind: 'car', secured: false, balance: 50_000, rate: 4.9 });
    const securedCar = debt({ id: 's', kind: 'car', secured: true, balance: 50_000, rate: 7 }); // 4.9 after avdrag
    expect(repaymentOrder([securedCar, unsecuredCar]).map((d) => d.id)).toEqual(['u', 's']);
  });
});

describe('migrateLegacyDebts', () => {
  it('moves loan expenses into loans without changing what the month costs', () => {
    const before = computeMetrics(prdExamplePlan(), NOW);
    const plan = migrateLegacyDebts(prdExamplePlan());
    const after = computeMetrics(plan, NOW);

    expect(plan.expenses.some((e) => e.id === 'car_finance' || e.id === 'student_loan')).toBe(false);
    expect(plan.debts?.map((d) => [d.kind, d.payment])).toEqual([
      ['other', 3200],
      ['other', 1500],
    ]);
    expect(after.lifestyleCost).toBe(before.lifestyleCost);
    expect(after.essentialCost).toBe(before.essentialCost);
    expect(after.breathingRoom).toBe(before.breathingRoom);
    expect(after.debt.monthly).toBe(4700);
    expect(after.spendingCost).toBe(before.lifestyleCost - 4700);
  });

  it('recognises the student loan suggestion as CSN and pairs mortgage payment with interest', () => {
    const plan = emptyPlan(NOW);
    plan.expenses = [
      expense({ id: 'i', name: 'Mortgage interest', subcategory: 'mortgage_interest', category: 'home', amount: 5000, tags: ['debt'] }),
      expense({ id: 'm', name: 'Mortgage payment', subcategory: 'mortgage', category: 'home', amount: 3000, tags: ['debt'] }),
      expense({ id: 's', name: 'Student loan', subcategory: 'student_loan', category: 'finance', amount: 1500, tags: ['debt'] }),
      expense({ id: 'rent', name: 'Rent', category: 'home', amount: 1000 }),
    ];
    const out = migrateLegacyDebts(plan);
    expect(out.expenses.map((e) => e.id)).toEqual(['rent']);
    const mortgage = out.debts!.find((d) => d.kind === 'mortgage')!;
    expect(mortgage).toMatchObject({ id: 'debt_m', amortization: 3000, payment: 8000, frequency: 'monthly' });
    expect(out.debts!.find((d) => d.kind === 'csn')).toMatchObject({ csnType: 'annuity', payment: 1500 });
  });

  it('is idempotent', () => {
    const once = migrateLegacyDebts(prdExamplePlan());
    expect(migrateLegacyDebts(once)).toBe(once);
  });
});

describe('loans in the plan metrics', () => {
  const plan = () => {
    const p = emptyPlan(NOW);
    p.income = [income({ amount: 50_000 })];
    p.expenses = [expense({ id: 'food', name: 'Food', amount: 5000 })];
    p.accounts = [{ id: 'a', name: 'Savings', kind: 'savings', balance: 100_000 }];
    p.debts = [
      debt({ id: 'home', kind: 'mortgage', balance: 2_000_000, rate: 3.6, amortization: 3000, propertyValue: 2_600_000 }),
      debt({ id: 'csn', kind: 'csn', csnType: 'annuity', balance: 150_000, rate: 2.135, payment: 4500, frequency: 'quarterly', nextDate: '2026-11-30' }),
    ];
    return p;
  };

  it('counts payments as essential, committed cost and keeps spending apart', () => {
    const m = computeMetrics(plan(), NOW);
    expect(m.debt.monthly).toBeCloseTo(6000 + 3000 + 1500, 5);
    expect(m.spendingCost).toBe(5000);
    expect(m.lifestyleCost).toBeCloseTo(15_500, 5);
    expect(m.essentialCost).toBeCloseTo(15_500, 5);
    expect(m.breathingRoom).toBeCloseTo(34_500, 5);
    expect(m.expenses.committed).toBe(5000);
  });

  it('puts the balance in net worth and the repayment in the future share of income', () => {
    const m = computeMetrics(plan(), NOW);
    expect(m.position.totalDebt).toBe(2_150_000);
    expect(m.position.netWorth).toBe(100_000 - 2_150_000);
    const csnInterest = (150_000 * 0.02135) / 12;
    expect(m.debt.principal).toBeCloseTo(3000 + 1500 - csnInterest, 5);
    expect(m.allocation.debtPaydown).toBeCloseTo(m.debt.principal / 50_000, 8);
    expect(m.allocation.lifestyle).toBeCloseTo((15_500 - m.debt.principal) / 50_000, 8);
  });

  it('gives ränteavdrag on the mortgage interest only', () => {
    const m = computeMetrics(plan(), NOW);
    expect(m.debt.taxReduction).toBeCloseTo(1800, 5); // 6 000 × 12 × 30 % ÷ 12
  });

  it('shows the runway with CSN lowered through nedsättning', () => {
    const m = computeMetrics(plan(), NOW);
    expect(m.resilience.essentialRunwayMonths).toBeCloseTo(100_000 / 15_500, 5);
    expect(m.resilience.essentialRunwayCsnReducedMonths).toBeCloseTo(100_000 / 14_000, 5);
  });

  it('lists quarterly CSN payments as upcoming, on each month end', () => {
    const csn = upcomingExpenses(plan(), NOW).filter((u) => u.source === 'debt');
    expect(csn.map((u) => [u.date.getMonth(), u.date.getDate(), u.amount])).toEqual([
      [10, 30, 4500],
      [1, 28, 4500],
      [4, 30, 4500],
      [7, 30, 4500],
    ]);
  });

  it('freezes loan balances into the month snapshot', () => {
    const snap = buildSnapshot(plan(), '2026-08', NOW);
    expect(snap.totalDebt).toBe(2_150_000);
    expect(snap.byDebt).toEqual({ home: 2_000_000, csn: 150_000 });
    expect(snap.plan?.debts?.every((d) => d.balances === undefined)).toBe(true);
  });
});
