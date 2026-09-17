import { wrapperOf } from './tax/capital';
import type { Account, Holding } from './types';

/** What `/api/quotes` answers: prices in each holding's own currency, and each currency's rate into the plan currency. */
export interface QuoteResult {
  quotes: Record<string, { price: number; isin?: string }>;
  fx: Record<string, number>;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** In the plan currency. Before the first refresh the purchase price stands in for the price. */
export const holdingValue = (h: Holding) => h.quantity * (h.price ?? h.avgPrice) * (h.fx ?? 1);

export const holdingCost = (h: Holding) => h.quantity * h.avgPrice * (h.fx ?? 1);

/**
 * The fields that follow from an account's holdings: the balance, and on an AF the cost basis and
 * fund share its tax reads. Empty for an account without holdings, whose balance is typed in.
 */
export function holdingsPatch(a: Account): Partial<Account> {
  const holdings = a.holdings ?? [];
  if (holdings.length === 0) return {};
  const value = holdings.reduce((s, h) => s + holdingValue(h), 0);
  const patch: Partial<Account> = { balance: cents((a.cash ?? 0) + value) };
  if (wrapperOf(a.kind) === 'af') {
    // ponytail: the cost basis uses today's exchange rate, not the rate on the day each lot was bought.
    patch.costBasis = cents(holdings.reduce((s, h) => s + holdingCost(h), 0));
    const funds = holdings.filter((h) => h.type === 'fund').reduce((s, h) => s + holdingValue(h), 0);
    patch.fundShare = value > 0 ? Math.round((funds / value) * 100) : 100;
  }
  return patch;
}

/**
 * Apply fresh prices. Returns the new account list, or null when nothing moved, so a refresh with the
 * same prices does not count as an edit (and does not push a sync).
 */
export function applyQuotes(accounts: Account[], result: QuoteResult, today: string): Account[] | null {
  let changed = false;
  const next = accounts.map((a) => {
    if (!a.holdings?.length) return a;
    let moved = false;
    const holdings = a.holdings.map((h) => {
      const q = result.quotes[h.orderbookId];
      const price = q?.price ?? h.price;
      const fx = result.fx[h.currency] ?? h.fx;
      const isin = q?.isin ?? h.isin;
      if (price === h.price && fx === h.fx && isin === h.isin) return h;
      moved = true;
      return { ...h, price, fx, isin, priceAt: today };
    });
    if (!moved) return a;
    changed = true;
    const updated = { ...a, holdings };
    return { ...updated, ...holdingsPatch(updated) };
  });
  return changed ? next : null;
}
