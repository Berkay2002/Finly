import { monthKeyOf } from './metrics';
import type { FinancialPlan, IncomeSource } from './types';

/**
 * What actually happened at the bank, set beside what the plan expects. Accounts say where the money
 * is, income and expenses say what should happen, transactions say what did: three things kept apart.
 * A transaction never moves a balance (the bank reports that itself) and never rewrites the plan.
 */

/** One line from the bank, in Finly's own shape so the engine does not know the provider. */
export interface BankTx {
  /** `AccountBankLink.externalId` of the account it is on. */
  account: string;
  /** Booking date, YYYY-MM-DD. */
  date: string;
  /** Signed: money in is positive. */
  amount: number;
  currency: string;
  counterparty?: string;
  counterpartyIban?: string;
  description?: string;
  /** Not booked yet: shown, but never matched, since the bank may still change or drop it. */
  pending?: boolean;
}

/** Money in is not income and money out is not an expense until it is known what it was. */
export type TxClass = 'income' | 'internal_transfer' | 'other';

export interface ClassifiedTx extends BankTx {
  class: TxClass;
  incomeSourceId?: string;
  /** The month an income counts for, which near a month's end is not always the month it arrived. */
  month?: string;
}

/** One of the user's own connected accounts. */
export interface OwnAccount {
  externalId: string;
  accountId: string;
  iban?: string;
}

const TRANSFER_DAYS = 3;
const AMOUNT_TOLERANCE = 0.25;
const DAY_TOLERANCE = 5;
const DAY_MS = 86_400_000;

const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);

/** 'Ericsson AB (publ)' and 'ERICSSON AB' are the same sender. */
export function normalizeParty(text: string | undefined): string {
  return (text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function sameParty(a: string | undefined, b: string | undefined): boolean {
  const x = normalizeParty(a);
  const y = normalizeParty(b);
  if (x.length < 3 || y.length < 3) return false;
  return x.includes(y) || y.includes(x);
}

/** Days between two days of the month, the short way round: the 30th and the 2nd are close. */
function dayDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 31;
  return Math.min(d, 31 - d);
}

/** A salary due on the 25th that lands on the 1st still belongs to the month before, and the other way round. */
export function incomeMonthOf(date: string, usualDay?: number): string {
  const d = new Date(`${date}T00:00:00`);
  const day = d.getDate();
  if (usualDay !== undefined) {
    if (usualDay >= 25 && day <= 5) d.setMonth(d.getMonth() - 1, 1);
    else if (usualDay <= 5 && day >= 25) d.setMonth(d.getMonth() + 1, 1);
  }
  return monthKeyOf(d);
}

/** How many of sender, amount and day agree. One alone proves nothing; two make a match. */
function incomeScore(tx: BankTx, source: IncomeSource): number {
  let score = 0;
  if (sameParty(tx.counterparty ?? tx.description, source.bankMatch?.counterparty)) score += 1;
  if (source.amount > 0 && Math.abs(tx.amount - source.amount) <= source.amount * AMOUNT_TOLERANCE) score += 1;
  if (source.bankMatch?.day !== undefined && dayDistance(new Date(`${tx.date}T00:00:00`).getDate(), source.bankMatch.day) <= DAY_TOLERANCE) score += 1;
  return score;
}

export function classifyTransactions(txs: BankTx[], plan: Pick<FinancialPlan, 'income'>, own: OwnAccount[]): ClassifiedTx[] {
  const ownIbans = new Set(own.map((o) => o.iban?.replace(/\s/g, '')).filter(Boolean));
  const accountOf = new Map(own.map((o) => [o.externalId, o.accountId]));
  const out: ClassifiedTx[] = txs.map((tx) => ({ ...tx, class: 'other' }));
  const booked = out.filter((tx) => !tx.pending);

  // Between the user's own accounts: named by the bank, or the same sum leaving one and reaching another.
  for (const tx of booked) if (tx.counterpartyIban && ownIbans.has(tx.counterpartyIban.replace(/\s/g, ''))) tx.class = 'internal_transfer';
  for (const debit of booked) {
    if (debit.amount >= 0 || debit.class !== 'other') continue;
    const credit = booked.find(
      (c) =>
        c.class === 'other' &&
        c.amount === -debit.amount &&
        c.account !== debit.account &&
        c.currency === debit.currency &&
        Math.abs(dayNumber(c.date) - dayNumber(debit.date)) <= TRANSFER_DAYS,
    );
    if (credit) debit.class = credit.class = 'internal_transfer';
  }

  for (const tx of booked) {
    if (tx.amount <= 0 || tx.class !== 'other') continue;
    let best: { source: IncomeSource; score: number; off: number } | undefined;
    for (const source of plan.income) {
      // A destination that no longer exists, or is not connected, restricts nothing.
      const destination = source.destinationAccountId && [...accountOf.values()].includes(source.destinationAccountId) ? source.destinationAccountId : undefined;
      if (destination && accountOf.get(tx.account) !== destination) continue;
      const score = incomeScore(tx, source);
      const off = Math.abs(tx.amount - source.amount);
      if (score >= 2 && (!best || score > best.score || (score === best.score && off < best.off))) best = { source, score, off };
    }
    if (best) {
      tx.class = 'income';
      tx.incomeSourceId = best.source.id;
      tx.month = incomeMonthOf(tx.date, best.source.bankMatch?.day);
    }
  }
  return out;
}

/** Income source id → month → what arrived. */
export function receivedByMonth(classified: ClassifiedTx[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const tx of classified) {
    if (tx.class !== 'income' || !tx.incomeSourceId || !tx.month) continue;
    const months = (out[tx.incomeSourceId] ??= {});
    months[tx.month] = Math.round(((months[tx.month] ?? 0) + tx.amount) * 100) / 100;
  }
  return out;
}

export interface IncomeStatus {
  id: string;
  /** What a month normally brings; null for income that does not come monthly, where a month has no expectation. */
  expected: number | null;
  received: number;
  /** Never negative: a bigger payment than planned leaves nothing still to come, not a debt. */
  remaining: number;
}

/** Expected, received and still to come for a month. A display of the plan beside the bank, not an input to it. */
export function incomeStatus(plan: Pick<FinancialPlan, 'income'>, month: string): IncomeStatus[] {
  return plan.income.map((i) => {
    const expected = i.frequency === 'monthly' ? i.amount : null;
    const received = i.actuals?.[month] ?? 0;
    return { id: i.id, expected, received, remaining: expected === null ? 0 : Math.max(0, expected - received) };
  });
}

/**
 * Lays a fresh fetch over what is stored for one account: everything from `from` on is replaced by
 * what the bank says now. No transaction ids are compared, because banks do not reliably give them,
 * and two identical purchases on one day are two purchases. A pending line that has since been booked
 * or dropped goes the same way.
 */
export function mergeWindow(stored: BankTx[], fetched: BankTx[], from: string, keepFrom: string): BankTx[] {
  return [...stored.filter((tx) => tx.date < from && !tx.pending), ...fetched.filter((tx) => tx.date >= from)]
    .filter((tx) => tx.date >= keepFrom)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
