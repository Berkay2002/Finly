import { wrapperOf } from './tax/capital';
import type { Account, Holding } from './types';

/** What `/api/quotes` answers: prices in each holding's own currency, and each currency's rate into the plan currency. */
export interface QuoteResult {
  quotes: Record<string, { price: number; isin?: string; change?: number }>;
  fx: Record<string, number>;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** In the plan currency. Before the first refresh the purchase price stands in for the price. */
export const holdingValue = (h: Holding) => h.quantity * (h.price ?? h.avgPrice) * (h.fx ?? 1);

export const holdingCost = (h: Holding) => h.quantity * h.avgPrice * (h.fx ?? 1);

/** Gain against what was paid, over the holdings that have a purchase price. Null when none has one. */
export function holdingsGain(holdings: Holding[]): { amount: number; share: number } | null {
  const priced = holdings.filter((h) => h.avgPrice > 0 && h.quantity > 0);
  const cost = priced.reduce((s, h) => s + holdingCost(h), 0);
  if (cost <= 0) return null;
  const amount = priced.reduce((s, h) => s + holdingValue(h), 0) - cost;
  return { amount, share: amount / cost };
}

/** The ticker at the end of a listing name, "Apple (AAPL)" → "AAPL". Not share-class tickers like "SHB A", which Logo.dev does not know. */
export const tickerOf = (name: string) => /\(([A-Z0-9.-]+)\)\s*$/.exec(name)?.[1];

export interface Trade {
  side: 'buy' | 'sell';
  quantity: number;
  /** Per unit, in the holding's currency. */
  price: number;
  /** Take a purchase from the account's cash, or put a sale's proceeds there. */
  useCash: boolean;
}

/**
 * Buy more of a holding or sell some. The average-cost rule (genomsnittsmetoden): a purchase blends into
 * the average price, a sale leaves it as it is. Selling everything removes the holding. `gain` is the
 * realized gain of a sale in the plan currency (0 for a purchase).
 */
export function applyTrade(a: Pick<Account, 'holdings' | 'cash'>, holdingId: string, trade: Trade): { holdings: Holding[]; cash: number; gain: number } {
  const holdings = a.holdings ?? [];
  const h = holdings.find((x) => x.id === holdingId);
  const cash = a.cash ?? 0;
  if (!h || !(trade.quantity > 0) || !(trade.price >= 0)) return { holdings, cash, gain: 0 };
  const fx = h.fx ?? 1;
  if (trade.side === 'sell') {
    const n = Math.min(trade.quantity, h.quantity);
    const left = h.quantity - n;
    return {
      // A remainder below a millionth of a unit is rounding, not a position.
      holdings: left > 1e-6 ? holdings.map((x) => (x === h ? { ...h, quantity: left } : x)) : holdings.filter((x) => x !== h),
      cash: trade.useCash ? cents(cash + n * trade.price * fx) : cash,
      gain: n * (trade.price - h.avgPrice) * fx,
    };
  }
  const quantity = h.quantity + trade.quantity;
  const avgPrice = (h.quantity * h.avgPrice + trade.quantity * trade.price) / quantity;
  return {
    holdings: holdings.map((x) => (x === h ? { ...h, quantity, avgPrice } : x)),
    // ponytail: cash never goes below 0; a purchase bigger than the cash is taken as a fresh deposit.
    cash: trade.useCash ? cents(Math.max(0, cash - trade.quantity * trade.price * fx)) : cash,
    gain: 0,
  };
}

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
      const dayChange = q ? q.change : h.dayChange;
      if (price === h.price && fx === h.fx && isin === h.isin && dayChange === h.dayChange) return h;
      moved = true;
      return { ...h, price, fx, isin, dayChange, priceAt: price === h.price ? h.priceAt : today };
    });
    if (!moved) return a;
    changed = true;
    const updated = { ...a, holdings };
    return { ...updated, ...holdingsPatch(updated) };
  });
  return changed ? next : null;
}
