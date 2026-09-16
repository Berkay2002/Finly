import { allMessages, messages } from '@/i18n';
import { amountSpread, monthlySpread } from './amounts';
import { frequencyForOccurrences, occurrencesPerMonth } from './frequency';
import { suggestionBySlug } from './taxonomy';
import type { Commute, CommutePrice, Commuter, ExpenseItem, FinancialPlan, Occurrences } from './types';

/**
 * A commute sets how many of each commuting cost a household buys. The prices stay on the expense items
 * (one lunch, one ticket, one day of parking), so editing an item later keeps working as before.
 */

export interface CommuteCounts {
  /** Person-days in per week. */
  daysIn: number;
  /** Lunches bought per week. */
  lunches: number;
  /** Single tickets per week: one each way. */
  tickets: number;
  /** Period cards, one per person travelling on one. */
  cards: number;
  /** Paid parking days per week. */
  parking: number;
  /** Congestion-charge passages per week. */
  passages: number;
}

const clampDays = (n: number) => (Number.isFinite(n) ? Math.min(7, Math.max(0, n)) : 0);

export function commuteCounts(commute: Commute | undefined): CommuteCounts {
  const c: CommuteCounts = { daysIn: 0, lunches: 0, tickets: 0, cards: 0, parking: 0, passages: 0 };
  for (const p of commute?.people ?? []) {
    const days = clampDays(p.days);
    if (days <= 0) continue;
    c.daysIn += days;
    if (p.buysLunch) c.lunches += days;
    if (p.mode === 'public') {
      if (p.ticket === 'single') c.tickets += 2 * days;
      else c.cards += 1;
    } else if (p.mode === 'car') {
      if (p.parking) c.parking += days;
      const passages = Number.isFinite(p.passages) ? Math.max(0, p.passages ?? 0) : 0;
      c.passages += days * passages;
    }
  }
  return c;
}

export interface CommuteLineMeta {
  key: CommutePrice;
  /** Expense item the count goes to. */
  slug: string;
  /** "One lunch", for the price field. */
  readonly priceLabel: string;
  per: 'week' | 'month';
  count: (c: CommuteCounts) => number;
}

const line = (key: CommutePrice, slug: string, per: 'week' | 'month', count: (c: CommuteCounts) => number): CommuteLineMeta => ({
  key,
  slug,
  get priceLabel() {
    return messages().everyday.commute.prices[key];
  },
  per,
  count,
});

export const COMMUTE_LINES: CommuteLineMeta[] = [
  line('lunch', 'work_lunches', 'week', (c) => c.lunches),
  line('ticket', 'public_transport', 'week', (c) => c.tickets),
  line('card', 'travel_card', 'month', (c) => c.cards),
  line('parking', 'car_parking', 'week', (c) => c.parking),
  line('passage', 'congestion', 'week', (c) => c.passages),
];

/** The item a commute line writes to: the first one in the plan with that slug. */
export function commuteItem(expenses: ExpenseItem[], slug: string): ExpenseItem | undefined {
  return expenses.find((e) => e.subcategory === slug && !e.includedElsewhere);
}

/**
 * Price of one of each: from the item when it is priced per purchase (a travel card is always one card),
 * else what the commute remembered, else 0 (unknown).
 */
export function commutePrices(plan: Pick<FinancialPlan, 'expenses' | 'commute'>): Record<CommutePrice, number> {
  const out = {} as Record<CommutePrice, number>;
  for (const line of COMMUTE_LINES) {
    const item = commuteItem(plan.expenses, line.slug);
    const fromItem = item && (item.occurrences || line.key === 'card') ? amountSpread(item).typical : 0;
    out[line.key] = fromItem > 0 ? fromItem : Math.max(0, plan.commute?.prices?.[line.key] ?? 0);
  }
  return out;
}

export interface CommuteChange {
  key: CommutePrice;
  slug: string;
  kind: 'add' | 'update' | 'remove';
  itemId?: string;
  name: string;
  /** New count per `per`; 0 for a removal. */
  count: number;
  /**
   * Price of one used for the change: the one given, or for an item entered as a weekly or monthly
   * total, that total spread over the new count. 0 while unknown.
   */
  price: number;
  per: 'week' | 'month';
  /** Monthly cost after the change (0 while the price is unknown). */
  monthly: number;
  /** Monthly cost of the item before the change. */
  previousMonthly: number;
}

function occurrencesFor(line: CommuteLineMeta, count: number): Occurrences | undefined {
  // One period card is a plain monthly cost; several are priced per card.
  if (line.key === 'card' && count === 1) return undefined;
  return { times: count, per: line.per };
}

/**
 * What saving `next` does to the plan's items. A line whose count drops to zero only removes the item
 * when the previous commute had put it there, so tickets for weekend trips are never taken away.
 */
export function commuteChanges(
  plan: Pick<FinancialPlan, 'expenses' | 'commute'>,
  next: Commute,
  prices: Record<CommutePrice, number>,
): CommuteChange[] {
  const counts = commuteCounts(next);
  const before = commuteCounts(plan.commute);
  const out: CommuteChange[] = [];
  for (const line of COMMUTE_LINES) {
    const count = line.count(counts);
    const item = commuteItem(plan.expenses, line.slug);
    const name = item?.name ?? suggestionBySlug(line.slug)?.name ?? line.slug;
    const previousMonthly = item ? monthlySpread(item).typical : 0;
    if (count > 0) {
      const perMonth = occurrencesPerMonth({ times: count, per: line.per });
      const totalItem = item && !item.occurrences && line.key !== 'card';
      const price = prices[line.key] > 0 ? prices[line.key] : totalItem ? Math.round(previousMonthly / perMonth) : 0;
      const kind = item ? 'update' : 'add';
      out.push({ key: line.key, slug: line.slug, kind, itemId: item?.id, name, count, price, per: line.per, monthly: price * perMonth, previousMonthly });
    } else if (item && line.count(before) > 0) {
      out.push({ key: line.key, slug: line.slug, kind: 'remove', itemId: item.id, name, count: 0, price: 0, per: line.per, monthly: 0, previousMonthly });
    }
  }
  return out;
}

/** Monthly cost of the commute at these prices. */
export function commuteMonthly(commute: Commute | undefined, prices: Record<CommutePrice, number>): number {
  const counts = commuteCounts(commute);
  return COMMUTE_LINES.reduce(
    (a, line) => a + Math.max(0, prices[line.key]) * occurrencesPerMonth({ times: line.count(counts), per: line.per }),
    0,
  );
}

/** Days in a week from which a period card is cheaper than a single ticket each way; null while a price is missing. */
export function cardBreakEvenDays(ticket: number, card: number): number | null {
  if (!(ticket > 0) || !(card > 0)) return null;
  return card / (2 * ticket * occurrencesPerMonth({ times: 1, per: 'week' }));
}

/**
 * Saves the commute and writes its counts and prices to the items: adds what is missing, updates what
 * is there, and removes what the old commute added and the new one no longer needs.
 */
export function applyCommute(
  plan: FinancialPlan,
  next: Commute,
  prices: Record<CommutePrice, number>,
  makeId: () => string,
  skip: ReadonlySet<CommutePrice> = new Set(),
): FinancialPlan {
  const changes = commuteChanges(plan, next, prices).filter((c) => !skip.has(c.key));
  let expenses = [...plan.expenses];
  for (const c of changes) {
    const line = COMMUTE_LINES.find((l) => l.key === c.key)!;
    const price = c.price;
    const occurrences = occurrencesFor(line, c.count);
    const cadence: Partial<ExpenseItem> = {
      occurrences,
      frequency: occurrences ? frequencyForOccurrences(occurrences) : 'monthly',
    };
    if (c.kind === 'remove') {
      expenses = expenses.filter((e) => e.id !== c.itemId);
    } else if (c.kind === 'update') {
      expenses = expenses.map((e) => {
        if (e.id !== c.itemId) return e;
        const wasPerPurchase = !!e.occurrences || c.key === 'card';
        const patch: Partial<ExpenseItem> = { ...cadence, billingLag: undefined };
        if (price > 0) patch.amount = price;
        // A range entered for a weekly or monthly total means nothing once the amount is one purchase.
        if (!wasPerPurchase) patch.range = undefined;
        return { ...e, ...patch };
      });
    } else {
      const s = suggestionBySlug(c.slug)!;
      expenses.push({
        id: makeId(),
        name: s.name,
        category: s.category,
        subcategory: s.slug,
        amount: price,
        ...cadence,
        frequency: cadence.frequency!,
        fixed: s.fixed,
        essential: s.essential,
        committed: s.committed,
        tags: s.tags ?? [],
      });
    }
  }
  const known = Object.fromEntries(Object.entries(prices).filter(([, v]) => v > 0));
  return {
    ...plan,
    expenses,
    commute: next.people.length > 0 ? { people: next.people, prices: { ...plan.commute?.prices, ...known } } : undefined,
  };
}

export function newCommuter(id: string, index: number): Commuter {
  const t = messages().everyday.commute;
  return {
    id,
    name: index === 0 ? t.you : index === 1 ? t.partner : t.person(index + 1),
    days: 5,
    mode: 'public',
    ticket: 'card',
    buysLunch: false,
  };
}

/**
 * A commuter's name for display. A default name ("You", "Partner", "Person 3") saved in any language
 * shows the default in the current language; a name the person typed is shown as is.
 */
export function commuterName(name: string): string {
  const t = messages().everyday.commute;
  const n = Number(name.match(/\d+$/)?.[0]);
  for (const m of allMessages()) {
    const c = m.everyday.commute;
    if (name === c.you) return t.you;
    if (name === c.partner) return t.partner;
    if (Number.isInteger(n) && name === c.person(n)) return t.person(n);
  }
  return name;
}
