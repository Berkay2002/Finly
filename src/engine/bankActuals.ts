import { spendGroupOf } from './everyday';
import { bundledGroup, bundledItem, passThroughBrand } from './merchants';
import { monthKeyOf } from './metrics';
import { mobileKey } from './vcard';
import { savingsPots } from './savings';
import type { ExpenseItem, FinancialPlan, IncomeSource, LineChoice, MerchantRule, SpendEntry, SpendGroup } from './types';

/**
 * What actually happened at the bank, set beside what the plan expects. Accounts say where the money
 * is, income and expenses say what should happen, transactions say what did: three things kept apart.
 * A transaction never moves a balance (the bank reports that itself) and never rewrites the plan.
 */

/** The bank's own word for a line, folded to what matters for sorting it. */
export type BankTxKind = 'card' | 'swish' | 'payment' | 'transfer' | 'credit_transfer' | 'direct_debit' | 'salary' | 'other';

/** One line from the bank, in Finly's own shape so the engine does not know the provider. */
export interface BankTx {
  /** The bank's stable reference for the line, when it gives one. Pending lines have none. */
  id?: string;
  kind?: BankTxKind;
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

/**
 * Money in is not income and money out is not an expense until it is known what it was. `expense` is a
 * bill or subscription in the plan, `spend` everyday spending in a group, `unsorted` money out (or in)
 * nobody has placed yet: still counted as spent, under other, so safe to spend stays honest.
 */
export type TxClass = 'income' | 'internal_transfer' | 'expense' | 'spend' | 'unsorted' | 'ignored' | 'statement' | 'lent';

export interface ClassifiedTx extends BankTx {
  class: TxClass;
  incomeSourceId?: string;
  expenseId?: string;
  group?: SpendGroup;
  /** A Klarna or PayPal statement: the subscriptions it is known to carry, and what is left, spent on who knows what. */
  bills?: { expenseId: string; amount: number }[];
  remainder?: number;
  /** Paid for someone else: what has come back so far, and whether nothing more is expected. */
  repaid?: number;
  settled?: boolean;
  /** Of a lent line: the part that was the person's own (half of a shared meal), spent right away. */
  mine?: number;
  /** A transfer the user said goes into this savings pot. */
  potId?: string;
  /** The payee, normalised: what rules are keyed by. */
  merchantKey?: string;
  /** The month an income counts for, which near a month's end is not always the month it arrived; for a bill, the month it was paid. */
  month?: string;
}

/** The part of the plan classification reads. Only income is needed to recognise salaries. */
export type ClassifyPlan = Pick<FinancialPlan, 'income'> & Partial<Pick<FinancialPlan, 'expenses' | 'accounts' | 'goals' | 'bank'>>;

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

/** The payee as rules see it: 'ICA NARA STR' and 'ICA NÄRA STR.' are one merchant. */
export function merchantKey(tx: Pick<BankTx, 'counterparty' | 'description'>): string {
  return normalizeParty(tx.counterparty ?? tx.description);
}

/** Stems a bill can be recognised by on a payment line with nothing learnt yet: 'Fortum el' and fortum.se both give FORTUM. */
function nameStems(item: Pick<ExpenseItem, 'name' | 'brandDomain'>): string[] {
  const word = normalizeParty(item.name.split(/[\s,/-]+/)[0]);
  const domain = item.brandDomain ? normalizeParty(item.brandDomain.replace(/^www\./, '').split('.')[0]) : '';
  return [word, domain].filter((s) => s.length >= 4);
}

export function closeTo(amount: number, target: number): boolean {
  return target > 0 && Math.abs(amount - target) <= target * AMOUNT_TOLERANCE;
}

function applyRule(tx: ClassifiedTx, rule: MerchantRule | LineChoice): void {
  if ('group' in rule) {
    tx.class = 'spend';
    tx.group = rule.group;
  } else if ('expenseId' in rule) {
    tx.class = 'expense';
    tx.expenseId = rule.expenseId;
    tx.month = tx.date.slice(0, 7);
  } else if ('potId' in rule) {
    tx.class = 'internal_transfer';
    tx.potId = rule.potId;
  } else if ('action' in rule) {
    tx.class = rule.action === 'transfer' ? 'internal_transfer' : rule.action === 'ignore' ? 'ignored' : 'lent';
    if (rule.action === 'settled') tx.settled = true;
    if (rule.action === 'lent' && 'mine' in rule && rule.mine) tx.mine = rule.mine;
  }
}

/** A bill rule learnt with an amount is for lines of about that size only. */
function ruleFits(rule: MerchantRule, amount: number): boolean {
  return !('expenseId' in rule) || rule.amount === undefined || closeTo(amount, rule.amount);
}

/**
 * A Klarna or PayPal line is a monthly statement the bank cannot see into. The subscriptions marked as
 * paid through that brand take their amounts from the month's first statement; the rest of every
 * statement is spent on who knows what. A statement smaller than the subscriptions is all theirs.
 */
function splitStatements(statements: ClassifiedTx[], expenses: ExpenseItem[]): void {
  const seen = new Set<string>();
  for (const tx of [...statements].sort((a, b) => a.date.localeCompare(b.date))) {
    const brand = passThroughBrand(tx.merchantKey ?? '')!;
    const key = `${brand}:${tx.date.slice(0, 7)}`;
    let left = -tx.amount;
    tx.bills = [];
    if (!seen.has(key)) {
      seen.add(key);
      for (const e of expenses) {
        if (passThroughBrand(normalizeParty(e.bankMatch?.counterparty)) !== brand) continue;
        const take = Math.min(left, e.bankMatch?.amount ?? fullAmount(e));
        if (take <= 0) continue;
        tx.bills.push({ expenseId: e.id, amount: round2(take) });
        left = round2(left - take);
      }
    }
    tx.remainder = left;
    tx.month = tx.date.slice(0, 7);
  }
}

/** How many others pay a share of a bill: the people named, else the number given. */
export function sharerCount(e: Pick<ExpenseItem, 'sharedWith' | 'sharedBy'>): number {
  return e.sharedBy?.length || e.sharedWith || 0;
}

/** What the bank shows for a bill: the person's share times everyone paying it. */
function fullAmount(e: Pick<ExpenseItem, 'amount' | 'sharedWith' | 'sharedBy'>): number {
  return e.amount * (sharerCount(e) + 1);
}

/**
 * The bill a payment is for: by what was learnt about the payee, or by the item's name on any line.
 * Never by amount alone: a wrong guess writes a bill and gets remembered, a miss costs one tap.
 */
function billFor(tx: ClassifiedTx, expenses: ExpenseItem[]): ExpenseItem | undefined {
  const key = tx.merchantKey ?? '';
  const paid = -tx.amount;
  const learnt = expenses.find((e) => {
    if (!e.bankMatch || !sameParty(key, e.bankMatch.counterparty)) return false;
    if (e.bankMatch.amount !== undefined) return closeTo(paid, e.bankMatch.amount);
    return e.fixed ? closeTo(paid, fullAmount(e)) : true;
  });
  if (learnt) return learnt;
  return expenses.find((e) => nameStems(e).some((stem) => key.includes(stem)) && (!e.fixed || closeTo(paid, fullAmount(e))));
}

/** A person by mobile number: their name when `names` has it, else the number the way Swedes write one. */
export function personLabel(key: string, names?: Record<string, string>): string {
  return names?.[key] ?? `0${key.slice(0, 2)}-${key.slice(2, 5)} ${key.slice(5, 7)} ${key.slice(7)}`;
}

/**
 * Who sent money in, as something stable to name them by: the phone number on a Swish, or the sender's
 * name the bank writes on a transfer (SEB gives no account, only the name, cut at 12 characters).
 * `people` (see `BankSetup.people`) folds a sender name onto the same person's Swish number.
 */
export function personKey(tx: Pick<BankTx, 'counterparty' | 'description' | 'kind'>, people?: Record<string, string>): string | undefined {
  const raw = mobileKey(tx.counterparty ?? tx.description) ?? (tx.kind === 'credit_transfer' ? normalizeParty(tx.counterparty ?? tx.description) || undefined : undefined);
  return raw && (people?.[raw] ?? raw);
}

/** The payee for showing: a Swish line carries a phone number, shown as the person. */
export function partyLabel(tx: Pick<BankTx, 'counterparty' | 'description'>, names?: Record<string, string>): string {
  const raw = (tx.counterparty ?? tx.description ?? '').trim();
  const key = mobileKey(raw);
  return key ? `Swish · ${personLabel(key, names)}` : raw;
}

export function classifyTransactions(txs: BankTx[], plan: ClassifyPlan, own: OwnAccount[]): ClassifiedTx[] {
  const ownIbans = new Set(own.map((o) => o.iban?.replace(/\s/g, '')).filter(Boolean));
  const accountOf = new Map(own.map((o) => [o.externalId, o.accountId]));
  const out: ClassifiedTx[] = txs.map((tx) => ({ ...tx, class: 'unsorted', merchantKey: merchantKey(tx) }));
  const booked = out.filter((tx) => !tx.pending);
  const institutionKeys = (a: { institution?: string; institutionDomain?: string }) =>
    [normalizeParty(a.institution), normalizeParty(a.institutionDomain?.replace(/^www\./, '').split('.')[0])].filter((s) => s.length >= 4);
  const institutions = (plan.accounts ?? []).flatMap(institutionKeys);
  const expenses = (plan.expenses ?? []).filter((e) => !e.includedElsewhere);

  // Between the user's own accounts: named by the bank, the same sum leaving one and reaching another,
  // or a transfer to a place the plan has an account at (AVANZA BANK).
  for (const tx of booked) if (tx.counterpartyIban && ownIbans.has(tx.counterpartyIban.replace(/\s/g, ''))) tx.class = 'internal_transfer';
  for (const tx of booked) {
    if (tx.class !== 'unsorted' || (tx.kind !== 'transfer' && tx.kind !== 'direct_debit')) continue;
    if (institutions.some((inst) => tx.merchantKey!.includes(inst) || inst.includes(tx.merchantKey!))) tx.class = 'internal_transfer';
  }
  for (const debit of booked) {
    if (debit.amount >= 0 || debit.class !== 'unsorted') continue;
    const credit = booked.find(
      (c) =>
        c.class === 'unsorted' &&
        c.amount === -debit.amount &&
        c.account !== debit.account &&
        c.currency === debit.currency &&
        Math.abs(dayNumber(c.date) - dayNumber(debit.date)) <= TRANSFER_DAYS,
    );
    if (credit) debit.class = credit.class = 'internal_transfer';
  }

  for (const tx of booked) {
    if (tx.amount <= 0 || tx.class !== 'unsorted') continue;
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

  // Money out: a choice made for the line itself, a statement, a bill it pays, the payee's rule, a chain Finly knows.
  const statements: ClassifiedTx[] = [];
  for (const tx of booked) {
    if (tx.amount >= 0 || tx.class !== 'unsorted') continue;
    const line = tx.id ? plan.bank?.lines?.[tx.id] : undefined;
    if (line && !('repays' in line)) {
      applyRule(tx, line);
      // Lent money keeps the payee's group, for the part that is the person's own.
      if ('action' in line && line.action === 'lent') {
        const rule = plan.bank?.merchants?.[tx.merchantKey!];
        tx.group = (rule && 'group' in rule ? rule.group : undefined) ?? bundledGroup(tx.merchantKey!);
      }
      continue;
    }
    if (passThroughBrand(tx.merchantKey!)) {
      tx.class = 'statement';
      statements.push(tx);
      continue;
    }
    // What the user said about the payee comes before what a bill claims by its name.
    const rule = plan.bank?.merchants?.[tx.merchantKey!];
    if (rule && ruleFits(rule, -tx.amount)) {
      applyRule(tx, rule);
      continue;
    }
    const bill = billFor(tx, expenses);
    if (bill) {
      applyRule(tx, { expenseId: bill.id });
      continue;
    }
    // A chain Finly knows goes on the plan's item for it (ICA on groceries, Foodora on takeaway) when there is one, else its group.
    const slug = bundledItem(tx.merchantKey!);
    const item = slug ? expenses.find((e) => e.subcategory === slug) : undefined;
    const group = bundledGroup(tx.merchantKey!);
    if (item) applyRule(tx, { expenseId: item.id });
    else if (group) applyRule(tx, { group });
  }
  // A line placed on an everyday item (groceries, restaurants) is that group's spending too: the group total is what the month runs on.
  const groupOfItem = new Map(expenses.map((e) => [e.id, spendGroupOf(e)]));
  for (const tx of booked) {
    const g = tx.class === 'expense' && tx.expenseId ? groupOfItem.get(tx.expenseId) : undefined;
    if (g) tx.group = g;
  }
  splitStatements(statements, expenses);
  // A transfer into savings is the pot whose monthly amount it is, when that is one pot; the account's place breaks a tie.
  const pots = savingsPots({ accounts: plan.accounts ?? [], goals: plan.goals ?? [] });
  const accountById = new Map((plan.accounts ?? []).map((a) => [a.id, a]));
  for (const tx of booked) {
    if (tx.amount >= 0 || tx.class !== 'internal_transfer' || tx.potId) continue;
    let hits = pots.filter((p) => p.monthlyContribution > 0 && p.monthlyContribution === -tx.amount);
    if (hits.length > 1) {
      hits = hits.filter((p) => {
        const a = p.accountId ? accountById.get(p.accountId) : undefined;
        return a && institutionKeys(a).some((k) => tx.merchantKey!.includes(k));
      });
    }
    if (hits.length === 1) tx.potId = hits[0].id;
  }
  // Money in that is not income: dismissed, a friend paying back what was bought for them, or someone's share of a bill.
  const lentById = new Map(booked.filter((tx) => tx.class === 'lent' && tx.id).map((tx) => [tx.id!, tx]));
  for (const tx of booked) {
    if (tx.amount <= 0 || tx.class !== 'unsorted') continue;
    const line = tx.id ? plan.bank?.lines?.[tx.id] : undefined;
    const rule = plan.bank?.merchants?.[tx.merchantKey!];
    if (line && 'expenseId' in line) applyRule(tx, line);
    else if (line && 'action' in line) tx.class = 'ignored';
    else if (line && 'repays' in line) {
      const lent = lentById.get(line.repays);
      if (!lent) continue;
      lent.repaid = round2((lent.repaid ?? 0) + tx.amount);
      tx.class = 'ignored';
    } else if (rule && 'expenseId' in rule && rule.amount !== undefined && closeTo(tx.amount, rule.amount)) applyRule(tx, rule);
  }
  // A bill shared with others: money in of about one share is a share. From the people named, one each a
  // month; with only a count, from anyone, up to that many a month.
  const shared = expenses.filter((e) => sharerCount(e) > 0 && e.amount > 0);
  if (shared.length) {
    const people = plan.bank?.people;
    const who = (k: string) => people?.[k] ?? k;
    const shares = new Map<string, number>();
    const bump = (k: string) => shares.set(k, (shares.get(k) ?? 0) + 1);
    const count = (tx: ClassifiedTx, id: string) => {
      const m = `${id}:${tx.date.slice(0, 7)}`;
      bump(m);
      const person = personKey(tx, people);
      if (person) bump(`${m}:${person}`);
    };
    for (const tx of booked) if (tx.amount > 0 && tx.class === 'expense' && tx.expenseId) count(tx, tx.expenseId);
    for (const tx of booked) {
      if (tx.amount <= 0 || tx.class !== 'unsorted') continue;
      const person = personKey(tx, people);
      const e = shared.find((s) => {
        if (!closeTo(tx.amount, s.amount)) return false;
        const m = `${s.id}:${tx.date.slice(0, 7)}`;
        if (s.sharedBy?.length) return !!person && s.sharedBy.some((k) => who(k) === person) && !shares.get(`${m}:${person}`);
        return (shares.get(m) ?? 0) < sharerCount(s);
      });
      if (!e) continue;
      applyRule(tx, { expenseId: e.id });
      count(tx, e.id);
    }
  }
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** What a lent line still waits for: what went out, less the person's own part and what has come back. */
export function owedOn(tx: Pick<ClassifiedTx, 'amount' | 'mine' | 'repaid'>): number {
  return round2(-tx.amount - (tx.mine ?? 0) - (tx.repaid ?? 0));
}

/** What is still owed back on everything lent out. */
export function lentTotal(classified: ClassifiedTx[]): number {
  return round2(lentOut(classified).reduce((sum, tx) => sum + owedOn(tx), 0));
}

/** Money out for someone else that has not come back in full: booked, biggest first. */
export function lentOut(classified: ClassifiedTx[]): ClassifiedTx[] {
  return classified.filter((tx) => tx.class === 'lent' && !tx.pending && !tx.settled && owedOn(tx) > 0).sort((a, b) => a.amount - b.amount);
}

/** The everyday group a line counts under, if any: its own, or other while nobody has placed it. */
export function spendGroupOfTx(tx: ClassifiedTx): SpendGroup | undefined {
  return tx.class === 'spend' || tx.class === 'expense' ? tx.group : tx.class === 'lent' ? (tx.group ?? 'other') : tx.class === 'unsorted' || tx.class === 'statement' ? 'other' : undefined;
}

/**
 * What of a line counts as spent. Lent money only for the person's own part, or all that never came back once
 * they give up on it; a statement for what no subscription explains; anything else in full.
 */
export function spentOf(tx: ClassifiedTx): number {
  if (tx.amount >= 0) return 0;
  return tx.class === 'lent' ? (tx.settled ? Math.max(0, -tx.amount - (tx.repaid ?? 0)) : (tx.mine ?? 0)) : tx.class === 'statement' ? (tx.remainder ?? 0) : -tx.amount;
}

/**
 * Everyday spending per group and month, summed from the bank. Unsorted money out counts under
 * other until it is placed. The running month carries `asOf` today so the pace is read right.
 */
export function spendByMonth(classified: ClassifiedTx[], today: Date): Record<SpendGroup, Record<string, SpendEntry>> {
  const out: Record<SpendGroup, Record<string, SpendEntry>> = { food: {}, transport: {}, leisure: {}, other: {} };
  const thisMonth = monthKeyOf(today);
  const asOf = `${thisMonth}-${String(today.getDate()).padStart(2, '0')}`;
  for (const tx of classified) {
    if (tx.pending || tx.amount >= 0) continue;
    const group = spendGroupOfTx(tx);
    if (!group) continue;
    const spent = spentOf(tx);
    if (spent <= 0) continue;
    const month = tx.date.slice(0, 7);
    const entry = (out[group][month] ??= { amount: 0, source: 'bank', ...(month === thisMonth ? { asOf } : {}) });
    entry.amount = round2(entry.amount + spent);
  }
  return out;
}

/** Expense id → month paid → what the bank says was paid. Two lines in a month add up. */
export function billsByMonth(classified: ClassifiedTx[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const tx of classified) {
    if (tx.pending || !tx.month) continue;
    const paid = tx.class === 'expense' && tx.expenseId ? [{ expenseId: tx.expenseId, amount: -tx.amount }] : tx.class === 'statement' ? (tx.bills ?? []) : [];
    for (const { expenseId, amount } of paid) {
      const months = (out[expenseId] ??= {});
      months[tx.month] = round2((months[tx.month] ?? 0) + amount);
    }
  }
  return out;
}

export interface MerchantToSort {
  key: string;
  /** As the bank wrote it, for showing. */
  label: string;
  count: number;
  total: number;
  lastDate: string;
  lines: ClassifiedTx[];
  /** Set when the payee looks like a monthly bill the plan does not have. */
  hint?: RecurringHint;
}

/**
 * Money out nobody has placed, by payee: likely bills first, then biggest first. `since` leaves out
 * lines too old to change any month the bank still writes.
 */
export function toSort(classified: ClassifiedTx[], since = '', names?: Record<string, string>, all = false): MerchantToSort[] {
  const by = new Map<string, MerchantToSort>();
  for (const tx of classified) {
    if (tx.pending || tx.amount >= 0 || tx.date < since) continue;
    // With `all`, every payee and where it sits, for looking over and changing; a statement is sorted line by line elsewhere.
    if (all ? tx.class === 'statement' : tx.class !== 'unsorted') continue;
    // A person is sorted one line at a time: what they are sent means something different each time.
    const key = mobileKey(tx.counterparty) ? `${tx.merchantKey}#${tx.id}` : (tx.merchantKey ?? '');
    const m = by.get(key) ?? { key, label: partyLabel(tx, names), count: 0, total: 0, lastDate: tx.date, lines: [] };
    m.count += 1;
    m.total = round2(m.total - tx.amount);
    if (tx.date > m.lastDate) m.lastDate = tx.date;
    m.lines.push(tx);
    by.set(key, m);
  }
  for (const m of by.values()) m.hint = recurringHint(m.lines);
  return [...by.values()].sort((a, b) => Number(!!b.hint) - Number(!!a.hint) || b.total - a.total);
}

export interface RecurringHint {
  amount: number;
  /** Day of the month it usually goes out. */
  day: number;
  /** The same amount every time. */
  fixed: boolean;
  /** Paid as a bill (payment or direct debit) rather than by card. */
  bill: boolean;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)];

/** A payee paid in two or more months at about the same amount looks like a bill Finly does not know yet. */
export function recurringHint(lines: ClassifiedTx[]): RecurringHint | undefined {
  const booked = lines.filter((l) => !l.pending && l.amount < 0);
  if (!booked.length) return undefined;
  const bill = booked.some((l) => l.kind === 'payment' || l.kind === 'direct_debit');
  const ref = median(booked.map((l) => -l.amount));
  // A bill's amount swings with the season; the kind already says what it is.
  const alike = bill ? booked : booked.filter((l) => closeTo(-l.amount, ref));
  if (new Set(alike.map((l) => l.date.slice(0, 7))).size < 2) return undefined;
  const amounts = alike.map((l) => -l.amount);
  return { amount: median(amounts), day: median(alike.map((l) => Number(l.date.slice(8)))), fixed: new Set(amounts).size === 1, bill };
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
 * what the bank says now, and an older stored line the bank sent again (same id) goes too, so nothing
 * is counted twice. Lines without an id are not compared: two identical purchases on one day are two
 * purchases. A pending line that has since been booked or dropped is replaced the same way.
 */
export function mergeWindow(stored: BankTx[], fetched: BankTx[], from: string, keepFrom: string): BankTx[] {
  const ids = new Set(fetched.flatMap((tx) => (tx.id ? [tx.id] : [])));
  return [...stored.filter((tx) => tx.date < from && !tx.pending && !(tx.id && ids.has(tx.id))), ...fetched.filter((tx) => tx.date >= from)]
    .filter((tx) => tx.date >= keepFrom)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
