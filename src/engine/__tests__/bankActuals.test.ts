import { describe, expect, it } from 'vitest';
import { classifyTransactions, incomeMonthOf, incomeStatus, mergeWindow, receivedByMonth, type BankTx, type OwnAccount } from '../bankActuals';
import { freezePlan } from '../history';
import { computeMetrics } from '../metrics';
import type { IncomeSource } from '../types';
import { income, NOW, prdExamplePlan } from './fixtures';

const OWN: OwnAccount[] = [
  { externalId: 'h-everyday', accountId: 'a1', iban: 'SE11 0000 0000 0000 0000 0001' },
  { externalId: 'h-savings', accountId: 'a2', iban: 'SE2200000000000000000002' },
];

const tx = (partial: Partial<BankTx> & { amount: number; date: string }): BankTx => ({ account: 'h-everyday', currency: 'SEK', ...partial });

const salary = income({ id: 'salary', name: 'Salary', amount: 30500 });
const matched: IncomeSource = { ...salary, bankMatch: { counterparty: 'Ericsson AB', day: 25 } };

describe('internal transfers', () => {
  it('money moved between own accounts is neither income nor an expense', () => {
    const out = classifyTransactions(
      [
        tx({ amount: -10000, date: '2026-09-10' }),
        tx({ account: 'h-savings', amount: 10000, date: '2026-09-11' }),
        tx({ amount: -850, date: '2026-09-10', counterparty: 'ICA' }),
      ],
      { income: [{ ...matched, amount: 10000, bankMatch: { day: 11 } }] },
      OWN,
    );
    expect(out.map((t) => t.class)).toEqual(['internal_transfer', 'internal_transfer', 'other']);
    expect(receivedByMonth(out)).toEqual({});
  });

  it('knows a transfer by the account it names, even when only one side is connected', () => {
    const [out] = classifyTransactions([tx({ amount: 5000, date: '2026-09-10', counterpartyIban: 'SE22 0000 0000 0000 0000 0002' })], { income: [matched] }, OWN);
    expect(out.class).toBe('internal_transfer');
  });

  it('does not pair sums on the same account, too far apart, or still pending', () => {
    const out = classifyTransactions(
      [
        tx({ amount: -500, date: '2026-09-01' }),
        tx({ amount: 500, date: '2026-09-02' }),
        tx({ amount: -700, date: '2026-09-01' }),
        tx({ account: 'h-savings', amount: 700, date: '2026-09-09' }),
        tx({ amount: -900, date: '2026-09-01' }),
        tx({ account: 'h-savings', amount: 900, date: '2026-09-01', pending: true }),
      ],
      { income: [] },
      OWN,
    );
    expect(out.every((t) => t.class === 'other')).toBe(true);
  });
});

describe('income matching', () => {
  it('needs two of sender, amount and day: one alone is not enough', () => {
    const classify = (t: BankTx, source = matched) => classifyTransactions([t], { income: [source] }, OWN)[0];
    expect(classify(tx({ amount: 30742, date: '2026-09-25', counterparty: 'ERICSSON AB (PUBL)' }))).toMatchObject({ class: 'income', incomeSourceId: 'salary', month: '2026-09' });
    expect(classify(tx({ amount: 30742, date: '2026-09-12', counterparty: 'Unknown' })).class).toBe('other');
    expect(classify(tx({ amount: 900, date: '2026-09-12', counterparty: 'Ericsson AB' })).class).toBe('other');
    // Sender and day agree, the amount is far off: a bonus month is still the salary.
    expect(classify(tx({ amount: 52000, date: '2026-09-24', counterparty: 'Ericsson AB' })).class).toBe('income');
    // Nothing learnt yet: the amount alone never matches.
    expect(classify(tx({ amount: 30500, date: '2026-09-25', counterparty: 'Ericsson AB' }), salary).class).toBe('other');
  });

  it('keeps to the account the income is paid into, unless that account is gone', () => {
    const onSavings = tx({ account: 'h-savings', amount: 30500, date: '2026-09-25', counterparty: 'Ericsson AB' });
    expect(classifyTransactions([onSavings], { income: [{ ...matched, destinationAccountId: 'a1' }] }, OWN)[0].class).toBe('other');
    expect(classifyTransactions([onSavings], { income: [{ ...matched, destinationAccountId: 'deleted' }] }, OWN)[0].class).toBe('income');
  });

  it('never treats a positive amount as income by itself, nor matches what is still pending', () => {
    const out = classifyTransactions(
      [tx({ amount: 1200, date: '2026-09-14', counterparty: 'Refund Zalando' }), tx({ amount: 30500, date: '2026-09-25', counterparty: 'Ericsson AB', pending: true })],
      { income: [matched] },
      OWN,
    );
    expect(out.map((t) => t.class)).toEqual(['other', 'other']);
  });

  it('counts a salary around the turn of the month for the month it belongs to', () => {
    expect(incomeMonthOf('2026-10-01', 28)).toBe('2026-09');
    expect(incomeMonthOf('2026-09-29', 1)).toBe('2026-10');
    expect(incomeMonthOf('2027-01-02', 27)).toBe('2026-12');
    expect(incomeMonthOf('2026-09-25', 25)).toBe('2026-09');
    expect(incomeMonthOf('2026-10-01')).toBe('2026-10');
  });
});

describe('expected, received, still expected', () => {
  it('a different amount is recorded as received and leaves the plan alone', () => {
    const plan = prdExamplePlan();
    const before = computeMetrics(plan, NOW);
    const month = '2026-09';
    expect(incomeStatus(plan, month).find((s) => s.id === 'salary')).toEqual({ id: 'salary', expected: 31500, received: 0, remaining: 31500 });

    plan.income = plan.income.map((i) => (i.id === 'salary' ? { ...i, actuals: { [month]: 32850 } } : i));
    expect(incomeStatus(plan, month).find((s) => s.id === 'salary')).toEqual({ id: 'salary', expected: 31500, received: 32850, remaining: 0 });
    expect(plan.income.find((i) => i.id === 'salary')!.amount).toBe(31500);

    const after = computeMetrics(plan, NOW);
    expect(after.income).toEqual(before.income);
    expect(after.safeToSpend).toBe(before.safeToSpend);
  });

  it('shows part of it still to come, and has no expectation for income that is not monthly', () => {
    const half = { ...salary, actuals: { '2026-09': 10000 } };
    const yearly = income({ id: 'bonus', amount: 60000, frequency: 'yearly' });
    expect(incomeStatus({ income: [half, yearly] }, '2026-09')).toEqual([
      { id: 'salary', expected: 30500, received: 10000, remaining: 20500 },
      { id: 'bonus', expected: null, received: 0, remaining: 0 },
    ]);
  });

  it('a closed month keeps only its own received figure', () => {
    const plan = prdExamplePlan();
    plan.income[0] = { ...plan.income[0], actuals: { '2026-08': 31000, '2026-09': 32850 } };
    expect(freezePlan(plan, '2026-08').income[0].actuals).toEqual({ '2026-08': 31000 });
    expect(freezePlan(plan, '2026-07').income[0].actuals).toBeUndefined();
  });
});

describe('mergeWindow', () => {
  const coffee = tx({ amount: -45, date: '2026-09-10', counterparty: 'Espresso House' });

  it('fetching the same days again adds nothing, and two identical purchases stay two', () => {
    const fetched = [coffee, { ...coffee }, tx({ amount: -850, date: '2026-09-12' })];
    const once = mergeWindow([], fetched, '2026-09-01', '2025-08-01');
    const twice = mergeWindow(once, fetched, '2026-09-01', '2025-08-01');
    expect(twice).toHaveLength(3);
    expect(twice.filter((t) => t.amount === -45)).toHaveLength(2);
  });

  it('a pending line that gets booked ends up as one line', () => {
    const stored = mergeWindow([], [tx({ amount: -300, date: '2026-09-15', pending: true })], '2026-09-01', '2025-08-01');
    const next = mergeWindow(stored, [tx({ amount: -300, date: '2026-09-16' })], '2026-09-06', '2025-08-01');
    expect(next).toEqual([tx({ amount: -300, date: '2026-09-16' })]);
  });

  it('keeps what is older than the window and drops what is past keeping', () => {
    const stored = [tx({ amount: -1, date: '2026-08-20' }), tx({ amount: -2, date: '2025-07-01' })];
    expect(mergeWindow(stored, [tx({ amount: -3, date: '2026-09-02' })], '2026-09-01', '2025-08-01').map((t) => t.amount)).toEqual([-3, -1]);
  });
});
