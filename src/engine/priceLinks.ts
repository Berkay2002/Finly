import { withTariffAmounts } from './electricity';
import { latestMonth, priceLevel, type FoodPrices } from './foodPrices';
import type { AmountRange, ExpenseItem, PriceArea, PriceLink } from './types';

/*
 * Costs that follow a price series. Two kinds so far: an amount linked to SCB's food price index
 * (`priceLink`), and a supply tariff whose spot price follows the month's average (`tariff.followSpot`).
 * Everything here is pure; the store applies it and store/usePriceRefresh.ts fetches the prices.
 * Refreshes are idempotent: a month already applied is never applied again, and a linked amount is
 * always recomputed from its base rather than nudged from the last figure.
 */

/** A month's average spot price, as lib/spotPrice.ts returns it. */
export interface SpotMonth {
  area: PriceArea;
  /** YYYY-MM. */
  month: string;
  /** öre/kWh incl. VAT. */
  oreInclVat: number;
}

export interface PriceInputs {
  food?: FoodPrices;
  spot?: SpotMonth[];
}

const round = (n: number) => Math.round(n);

const sameRange = (a: AmountRange | undefined, b: AmountRange | undefined) => a?.low === b?.low && a?.high === b?.high;

const scaleRange = (r: AmountRange | undefined, k: number): AmountRange | undefined =>
  r ? { low: round(r.low * k), high: round(r.high * k) } : undefined;

/** A link that takes the item's current amount and range as the base, priced at `month`. */
export function foodPriceLink(item: Pick<ExpenseItem, 'amount' | 'range'>, month: string): PriceLink {
  return { index: 'food', base: { amount: item.amount, range: item.range }, baseMonth: month, month };
}

function sameLink(a: PriceLink | undefined, b: PriceLink | undefined): boolean {
  return (
    !!a &&
    !!b &&
    a.index === b.index &&
    a.baseMonth === b.baseMonth &&
    a.month === b.month &&
    a.base.amount === b.base.amount &&
    sameRange(a.base.range, b.base.range)
  );
}

/**
 * After an edit: a hand-typed amount on a linked item becomes the new base, priced at the month the
 * item currently reflects. A tariff and a link cannot both decide the amount; the tariff wins.
 */
export function reconcilePriceLink(prev: ExpenseItem | undefined, next: ExpenseItem): ExpenseItem {
  const link = next.priceLink;
  if (!link) return next;
  if (next.tariff) return { ...next, priceLink: undefined };
  const edited =
    !sameLink(prev?.priceLink, link) || next.amount !== prev?.amount || !sameRange(next.range, prev?.range);
  if (!edited || (link.base.amount === next.amount && sameRange(link.base.range, next.range))) return next;
  return {
    ...next,
    priceLink: { ...link, base: { amount: next.amount, range: next.range }, baseMonth: link.month ?? link.baseMonth },
  };
}

/** Bring a food-linked amount to the newest month in `prices`. Same object back when nothing is newer. */
export function followFoodPrices(item: ExpenseItem, prices: FoodPrices): ExpenseItem {
  const link = item.priceLink;
  if (!link || link.index !== 'food') return item;
  const month = latestMonth(prices);
  if (month <= (link.month ?? '')) return item;
  const level = priceLevel(prices, link.baseMonth);
  return {
    ...item,
    amount: round(link.base.amount * level),
    range: scaleRange(link.base.range, level),
    priceLink: { ...link, month },
  };
}

/** Put the month's average spot price into a supply tariff that follows it. Same object back when the month is not newer. */
export function followSpot(item: ExpenseItem, spot: SpotMonth[]): ExpenseItem {
  const t = item.tariff;
  if (!t?.followSpot || t.part !== 'supply' || !t.priceArea) return item;
  const avg = spot.find((s) => s.area === t.priceArea);
  if (!avg || avg.month <= (t.priceMonth ?? '')) return item;
  return withTariffAmounts({ ...item, tariff: { ...t, energyPrice: avg.oreInclVat, priceMonth: avg.month } });
}

/** Price areas whose following tariffs still lack `month`'s average, so only those are fetched. */
export function spotAreasToRefresh(expenses: ExpenseItem[], month: string): PriceArea[] {
  const areas = new Set<PriceArea>();
  for (const e of expenses) {
    const t = e.tariff;
    if (t?.followSpot && t.part === 'supply' && t.priceArea && (t.priceMonth ?? '') < month) areas.add(t.priceArea);
  }
  return [...areas];
}

/** Whether any linked item is behind `prices`, so a store write can be skipped otherwise. */
export function foodLinksToRefresh(expenses: ExpenseItem[], prices: FoodPrices): boolean {
  const month = latestMonth(prices);
  return expenses.some((e) => e.priceLink?.index === 'food' && (e.priceLink.month ?? '') < month);
}

/** Apply every price input. Untouched items keep their identity; `changed` lists the ids that moved. */
export function refreshPriceLinks(
  expenses: ExpenseItem[],
  inputs: PriceInputs,
): { expenses: ExpenseItem[]; changed: string[] } {
  const changed: string[] = [];
  const out = expenses.map((e) => {
    let next = e;
    if (inputs.food) next = followFoodPrices(next, inputs.food);
    if (inputs.spot) next = followSpot(next, inputs.spot);
    if (next !== e) changed.push(e.id);
    return next;
  });
  return { expenses: out, changed };
}
