import { describe, expect, it } from 'vitest';
import { billsByMonth, classifyTransactions, incomeMonthOf, incomeStatus, lentOut, mergeWindow, partyLabel, receivedByMonth, recurringHint, spendByMonth, toSort, type BankTx, type OwnAccount } from '../bankActuals';
import { freezePlan } from '../history';
import { computeMetrics } from '../metrics';
import type { IncomeSource } from '../types';
import { savingsPots } from '../savings';
import { expense, income, NOW, prdExamplePlan } from './fixtures';

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
    expect(out.map((t) => t.class)).toEqual(['internal_transfer', 'internal_transfer', 'spend']);
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
    expect(out.every((t) => t.class === 'unsorted')).toBe(true);
  });

  it('a transfer into savings is the pot with that monthly amount, and a one-off is just a transfer', () => {
    const plan = prdExamplePlan();
    plan.accounts.find((a) => a.id === 'a4')!.institution = 'Avanza';
    const pots = savingsPots(plan);
    const out = classifyTransactions(
      [
        tx({ id: 'a', amount: -3000, date: '2026-09-27', kind: 'transfer', counterparty: 'AVANZA BANK' }),
        tx({ id: 'b', amount: -2000, date: '2026-09-27', kind: 'transfer', counterparty: 'AVANZA BANK' }),
        tx({ id: 'c', amount: -700, date: '2026-09-28', kind: 'transfer', counterparty: 'AVANZA BANK' }),
      ],
      plan,
      OWN,
    );
    expect(out.map((t) => t.class)).toEqual(['internal_transfer', 'internal_transfer', 'internal_transfer']);
    expect(out.map((t) => t.potId)).toEqual([pots.find((p) => p.accountId === 'a4')!.id, pots.find((p) => p.accountId === 'a3')!.id, undefined]);
  });

  it('a transfer to a place the plan has an account at is between own accounts, even with no IBAN', () => {
    const plan = { income: [], accounts: [{ id: 'isk', name: 'ISK', institutionDomain: 'avanza.se', kind: 'isk' as const, balance: 0 }] };
    const [avanza, klarna] = classifyTransactions(
      [tx({ amount: -3000, date: '2026-08-27', kind: 'transfer', counterparty: 'AVANZA BANK' }), tx({ amount: -1200, date: '2026-08-26', kind: 'transfer', counterparty: 'K*KLARNA' })],
      plan,
      OWN,
    );
    expect(avanza.class).toBe('internal_transfer');
    expect(klarna.class).toBe('statement');
  });
});

describe('money out', () => {
  const fortum = expense({ id: 'el', name: 'Fortum el', amount: 900, fixed: false });
  const spotify = expense({ id: 'spotify', name: 'Spotify', amount: 129, fixed: true, bankMatch: { counterparty: 'K*KLARNA', amount: 129 } });
  const plan = (extra: Partial<ReturnType<typeof prdExamplePlan>> = {}) => ({ income: [], expenses: [fortum, spotify], ...extra });

  it('sorts chains it knows and leaves the rest unsorted, still counted as spent', () => {
    const out = classifyTransactions(
      [
        tx({ id: 'a', amount: -850, date: '2026-09-10', kind: 'card', counterparty: 'ICA NARA STR' }),
        tx({ id: 'b', amount: -46, date: '2026-09-11', kind: 'card', counterparty: 'SL APP' }),
        tx({ id: 'c', amount: -129, date: '2026-09-11', kind: 'card', counterparty: 'MAX BURGERS' }),
        tx({ id: 'd', amount: -499, date: '2026-09-12', kind: 'card', counterparty: 'STADIUM OUTL' }),
      ],
      plan(),
      OWN,
    );
    expect(out.map((t) => [t.class, t.group])).toEqual([['spend', 'food'], ['spend', 'transport'], ['spend', 'food'], ['unsorted', undefined]]);
    const spend = spendByMonth(out, new Date(2026, 8, 16));
    expect(spend.food['2026-09']).toEqual({ amount: 979, source: 'bank', asOf: '2026-09-16' });
    expect(spend.transport['2026-09']).toEqual({ amount: 46, source: 'bank', asOf: '2026-09-16' });
    expect(spend.leisure['2026-09']).toEqual({ amount: 499, source: 'bank', asOf: '2026-09-16' });
    expect(spendByMonth(out, new Date(2026, 9, 3)).food['2026-09']).toEqual({ amount: 979, source: 'bank' });
  });

  it('a bill payment matches the item by name before anything is learnt, and by what was learnt after', () => {
    const out = classifyTransactions(
      [
        tx({ id: 'a', amount: -1043, date: '2026-09-01', kind: 'payment', counterparty: 'FORTUM MARKETS AB' }),
        tx({ id: 'b', amount: -129, date: '2026-09-02', kind: 'transfer', counterparty: 'K*KLARNA' }),
        tx({ id: 'c', amount: -1200, date: '2026-09-03', kind: 'transfer', counterparty: 'K* KLARNA' }),
        tx({ id: 'd', amount: -1043, date: '2026-09-04', kind: 'card', counterparty: 'FORTUM MARKETS AB' }),
      ],
      plan(),
      OWN,
    );
    expect(out.map((t) => [t.class, t.expenseId])).toEqual([['expense', 'el'], ['statement', undefined], ['statement', undefined], ['expense', 'el']]);
    expect(billsByMonth(out)).toEqual({ el: { '2026-09': 2086 }, spotify: { '2026-09': 129 } });
  });

  it('splits a Klarna statement between the subscriptions paid through it and the rest', () => {
    const netflix = expense({ id: 'netflix', name: 'Netflix', amount: 199, fixed: true, bankMatch: { counterparty: 'KLARNA' } });
    const out = classifyTransactions(
      [
        tx({ id: 'a', amount: -1235, date: '2026-08-26', kind: 'transfer', counterparty: 'K*KLARNA' }),
        tx({ id: 'b', amount: -300, date: '2026-08-28', kind: 'transfer', counterparty: 'K* KLARNA' }),
        tx({ id: 'c', amount: -200, date: '2026-09-26', kind: 'transfer', counterparty: 'K*KLARNA' }),
        tx({ id: 'd', amount: -13, date: '2026-09-04', kind: 'card', counterparty: 'PAYPAL ONE' }),
      ],
      { income: [], expenses: [spotify, netflix] },
      OWN,
    );
    expect(out.map((t) => [t.class, t.bills, t.remainder])).toEqual([
      ['statement', [{ expenseId: 'spotify', amount: 129 }, { expenseId: 'netflix', amount: 199 }], 907],
      ['statement', [], 300],
      ['statement', [{ expenseId: 'spotify', amount: 129 }, { expenseId: 'netflix', amount: 71 }], 0],
      ['statement', [], 13],
    ]);
    expect(billsByMonth(out)).toEqual({ spotify: { '2026-08': 129, '2026-09': 129 }, netflix: { '2026-08': 199, '2026-09': 71 } });
    expect(spendByMonth(out, new Date(2026, 9, 3)).leisure).toEqual({ '2026-08': { amount: 1207, source: 'bank' }, '2026-09': { amount: 13, source: 'bank' } });
    expect(toSort(out)).toEqual([]);
  });

  it('money out for someone else is spent until their Swish brings it back', () => {
    const lines = [
      tx({ id: 'buy', amount: -5889, date: '2026-09-09', kind: 'card', counterparty: 'INET AB' }),
      tx({ id: 'back', amount: 5889, date: '2026-09-14', kind: 'swish', counterparty: '46702330253' }),
    ];
    const bank = { provider: 'p', appId: 'x', sessions: [] };
    const lent = classifyTransactions(lines, { income: [], bank: { ...bank, lines: { buy: { action: 'lent' } } } }, OWN);
    expect(lent.map((t) => t.class)).toEqual(['lent', 'unsorted']);
    expect(spendByMonth(lent, new Date(2026, 8, 16)).leisure['2026-09']).toMatchObject({ amount: 5889 });
    expect(lentOut(lent).map((t) => t.id)).toEqual(['buy']);
    expect(toSort(lent)).toEqual([]);

    const repaid = classifyTransactions(lines, { income: [], bank: { ...bank, lines: { buy: { action: 'lent' }, back: { repays: 'buy' } } } }, OWN);
    expect(repaid.map((t) => t.class)).toEqual(['lent', 'ignored']);
    expect(spendByMonth(repaid, new Date(2026, 8, 16)).leisure).toEqual({});
    expect(lentOut(repaid)).toEqual([]);
  });

  it('never takes a line for a bill on its amount alone, but knows an item by name on a card line too', () => {
    const rent = expense({ id: 'rent', name: 'Rent', amount: 4760, fixed: true });
    const groceries = expense({ id: 'food', name: 'Groceries', subcategory: 'groceries', amount: 4800, fixed: false });
    const out = classifyTransactions(
      [
        tx({ id: 'a', amount: -4760, date: '2026-08-25', kind: 'transfer', counterparty: 'HELLESEN-HANSEN MATS & C' }),
        tx({ id: 'b', amount: -4760, date: '2026-08-26', kind: 'card', counterparty: 'ELGIGANTEN' }),
        tx({ id: 'c', amount: -4700, date: '2026-08-27', kind: 'transfer', counterparty: 'SOMEONE ELSE' }),
        tx({ id: 'd', amount: -219, date: '2026-08-25', kind: 'card', counterparty: 'SPOTIFY P460' }),
      ],
      { income: [], expenses: [rent, groceries, expense({ id: 'spotify', name: 'Spotify', amount: 219, fixed: true })] },
      OWN,
    );
    expect(out.map((t) => [t.class, t.expenseId])).toEqual([['unsorted', undefined], ['unsorted', undefined], ['unsorted', undefined], ['expense', 'spotify']]);
  });

  it('shows a Swish number the way it is written on a phone', () => {
    expect(partyLabel({ counterparty: '46702330253' })).toBe('Swish · 070-233 02 53');
    expect(partyLabel({ counterparty: '+46 70 233 02 53' })).toBe('Swish · 070-233 02 53');
    expect(partyLabel({ counterparty: '1065578522 A' })).toBe('1065578522 A');
    expect(partyLabel({ counterparty: 'ICA NARA STR' })).toBe('ICA NARA STR');
  });

  it('a choice for the line beats the payee rule, which beats the bundled list', () => {
    const ica = tx({ id: 'a', amount: -850, date: '2026-09-10', kind: 'card', counterparty: 'ICA NARA STR' });
    const bank = { provider: 'p', appId: 'x', sessions: [] };
    expect(classifyTransactions([ica], plan({ bank: { ...bank, merchants: { ICANARASTR: { group: 'leisure' } } } }), OWN)[0].group).toBe('leisure');
    expect(classifyTransactions([ica], plan({ bank: { ...bank, merchants: { ICANARASTR: { group: 'leisure' } }, lines: { a: { group: 'transport' } } } }), OWN)[0].group).toBe('transport');
    expect(classifyTransactions([ica], plan({ bank: { ...bank, merchants: { ICANARASTR: { action: 'ignore' } } } }), OWN)[0].class).toBe('ignored');
    expect(classifyTransactions([ica], plan({ bank: { ...bank, lines: { a: { potId: 'barn' } } } }), OWN)[0]).toMatchObject({ class: 'internal_transfer', potId: 'barn' });
    expect(classifyTransactions([ica], plan({ bank: { ...bank, lines: { a: { expenseId: 'el' } } } }), OWN)[0]).toMatchObject({ class: 'expense', expenseId: 'el', month: '2026-09' });
  });

  it('money in from a person is neither income nor spending, and can be dismissed', () => {
    const friend = tx({ id: 'f', amount: 500, date: '2026-09-04', kind: 'credit_transfer', counterparty: 'JONATAN FRED' });
    expect(classifyTransactions([friend], { income: [matched] }, OWN)[0].class).toBe('unsorted');
    expect(classifyTransactions([friend], { income: [matched], bank: { provider: 'p', appId: 'x', sessions: [], lines: { f: { action: 'ignore' } } } }, OWN)[0].class).toBe('ignored');
    expect(toSort(classifyTransactions([friend], { income: [] }, OWN))).toEqual([]);
  });

  it('spots a payee paid month after month as a bill Finly does not know yet', () => {
    const out = classifyTransactions(
      [
        tx({ id: 'a', amount: -1043, date: '2026-07-01', kind: 'payment', counterparty: 'EON KUNDSUPPORT' }),
        tx({ id: 'b', amount: -1590, date: '2026-08-02', kind: 'payment', counterparty: 'EON KUNDSUPPORT' }),
        tx({ id: 'c', amount: -129, date: '2026-07-25', kind: 'card', counterparty: 'NETFLIX.COM' }),
        tx({ id: 'd', amount: -129, date: '2026-08-25', kind: 'card', counterparty: 'NETFLIX.COM' }),
        tx({ id: 'e', amount: -129, date: '2026-08-05', kind: 'transfer', counterparty: 'K*KLARNA' }),
        tx({ id: 'f', amount: -129, date: '2026-09-05', kind: 'transfer', counterparty: 'K*KLARNA' }),
        tx({ id: 'g', amount: -1200, date: '2026-09-03', kind: 'transfer', counterparty: 'K*KLARNA' }),
        tx({ id: 'h', amount: -499, date: '2026-09-12', kind: 'card', counterparty: 'STADIUM OUTL' }),
      ],
      { income: [], expenses: [fortum] },
      OWN,
    );
    expect(toSort(out).map((m) => [m.key, !!m.hint])).toEqual([['EONKUNDSUPPORT', true], ['NETFLIXCOM', true], ['STADIUMOUTL', false]]);
    const by = Object.fromEntries(toSort(out).map((m) => [m.key, m.lines]));
    expect(recurringHint(by.EONKUNDSUPPORT)).toEqual({ amount: 1043, day: 1, fixed: false, bill: true });
    expect(recurringHint(by.NETFLIXCOM)).toEqual({ amount: 129, day: 25, fixed: true, bill: false });
    expect(recurringHint(by.STADIUMOUTL)).toBeUndefined();
  });

  it('lists what is left to sort by payee, biggest first', () => {
    const out = classifyTransactions(
      [
        tx({ id: 'a', amount: -200, date: '2026-09-10', kind: 'card', counterparty: 'STADIUM OUTL' }),
        tx({ id: 'b', amount: -300, date: '2026-09-12', kind: 'card', counterparty: 'STADIUM OUTL' }),
        tx({ id: 'c', amount: -1200, date: '2026-09-03', kind: 'transfer', counterparty: 'K* KLARNA' }),
        tx({ id: 'd', amount: -850, date: '2026-09-10', kind: 'card', counterparty: 'ICA NARA STR' }),
        tx({ amount: -99, date: '2026-09-17', kind: 'card', counterparty: 'HEMKOP NORRKOPING', pending: true }),
      ],
      plan(),
      OWN,
    );
    expect(toSort(out).map((m) => [m.key, m.count, m.total])).toEqual([['STADIUMOUTL', 2, 500]]);
    expect(toSort(out, '2026-09-11').map((m) => m.key)).toEqual(['STADIUMOUTL']);
  });
});

describe('income matching', () => {
  it('needs two of sender, amount and day: one alone is not enough', () => {
    const classify = (t: BankTx, source = matched) => classifyTransactions([t], { income: [source] }, OWN)[0];
    expect(classify(tx({ amount: 30742, date: '2026-09-25', counterparty: 'ERICSSON AB (PUBL)' }))).toMatchObject({ class: 'income', incomeSourceId: 'salary', month: '2026-09' });
    expect(classify(tx({ amount: 30742, date: '2026-09-12', counterparty: 'Unknown' })).class).toBe('unsorted');
    expect(classify(tx({ amount: 900, date: '2026-09-12', counterparty: 'Ericsson AB' })).class).toBe('unsorted');
    // Sender and day agree, the amount is far off: a bonus month is still the salary.
    expect(classify(tx({ amount: 52000, date: '2026-09-24', counterparty: 'Ericsson AB' })).class).toBe('income');
    // Nothing learnt yet: the amount alone never matches.
    expect(classify(tx({ amount: 30500, date: '2026-09-25', counterparty: 'Ericsson AB' }), salary).class).toBe('unsorted');
  });

  it('keeps to the account the income is paid into, unless that account is gone', () => {
    const onSavings = tx({ account: 'h-savings', amount: 30500, date: '2026-09-25', counterparty: 'Ericsson AB' });
    expect(classifyTransactions([onSavings], { income: [{ ...matched, destinationAccountId: 'a1' }] }, OWN)[0].class).toBe('unsorted');
    expect(classifyTransactions([onSavings], { income: [{ ...matched, destinationAccountId: 'deleted' }] }, OWN)[0].class).toBe('income');
  });

  it('never treats a positive amount as income by itself, nor matches what is still pending', () => {
    const out = classifyTransactions(
      [tx({ amount: 1200, date: '2026-09-14', counterparty: 'Refund Zalando' }), tx({ amount: 30500, date: '2026-09-25', counterparty: 'Ericsson AB', pending: true })],
      { income: [matched] },
      OWN,
    );
    expect(out.map((t) => t.class)).toEqual(['unsorted', 'unsorted']);
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

  it('a line the bank sends again under the same id is one line, wherever it was stored', () => {
    const stored = mergeWindow([], [tx({ id: 'x', amount: -300, date: '2026-08-20' }), tx({ id: 'y', amount: -300, date: '2026-08-20' })], '2026-08-01', '2025-08-01');
    const next = mergeWindow(stored, [tx({ id: 'x', amount: -300, date: '2026-09-02' })], '2026-09-01', '2025-08-01');
    expect(next.map((t) => [t.id, t.date])).toEqual([['x', '2026-09-02'], ['y', '2026-08-20']]);
  });

  it('keeps what is older than the window and drops what is past keeping', () => {
    const stored = [tx({ amount: -1, date: '2026-08-20' }), tx({ amount: -2, date: '2025-07-01' })];
    expect(mergeWindow(stored, [tx({ amount: -3, date: '2026-09-02' })], '2026-09-01', '2025-08-01').map((t) => t.amount)).toEqual([-3, -1]);
  });
});
