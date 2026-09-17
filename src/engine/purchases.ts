/**
 * Big purchases other than a car or a home: what a trip adds up to, what owning a gadget costs a month over the
 * years it is kept, and a phone bought outright against one paid through an operator plan.
 */

const pos = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);

export interface TripInput {
  travellers: number;
  nights: number;
  /** Plan currency, per traveller, return. */
  travelPerPerson: number;
  /** Local currency, for the whole party, per night. */
  stayPerNight: number;
  /** Local currency, per traveller, per day. */
  foodPerPersonDay: number;
  /** Local currency, whole trip. */
  localTransport: number;
  activities: number;
  spending: number;
  /** Plan currency, whole trip. */
  insurance: number;
  /** Extra on top of everything, in percent, for what always comes up. */
  bufferPercent: number;
  /** Plan currency per unit of the local currency. */
  fx: number;
}

export interface TripCost {
  days: number;
  travel: number;
  stay: number;
  food: number;
  localTransport: number;
  activities: number;
  spending: number;
  insurance: number;
  buffer: number;
  total: number;
  perPerson: number;
  perDay: number;
}

/** A trip in the plan's currency. Food is counted for every day away, one more than the nights. */
export function tripCost(i: TripInput): TripCost {
  const people = Math.max(1, Math.round(pos(i.travellers)));
  const nights = Math.round(pos(i.nights));
  const days = nights + 1;
  const fx = pos(i.fx) || 1;
  const travel = pos(i.travelPerPerson) * people;
  const stay = pos(i.stayPerNight) * nights * fx;
  const food = pos(i.foodPerPersonDay) * people * days * fx;
  const localTransport = pos(i.localTransport) * fx;
  const activities = pos(i.activities) * fx;
  const spending = pos(i.spending) * fx;
  const insurance = pos(i.insurance);
  const sub = travel + stay + food + localTransport + activities + spending + insurance;
  const buffer = (sub * pos(i.bufferPercent)) / 100;
  const total = sub + buffer;
  return { days, travel, stay, food, localTransport, activities, spending, insurance, buffer, total, perPerson: total / people, perDay: total / days };
}

/**
 * What owning something costs a month over the years it is kept: what it takes out of pocket (price, extras and
 * any interest, less the old one sold) minus what it sells for at the end, spread over the months, plus running costs.
 */
export function ownershipMonthly(i: { price: number; extras?: number; tradeIn?: number; loanExtra?: number; resale?: number; years: number; running?: number }): number {
  const months = Math.max(1, Math.round(pos(i.years) * 12));
  const net = pos(i.price) + pos(i.extras) + pos(i.loanExtra) - pos(i.tradeIn) - pos(i.resale);
  return Math.max(0, net) / months + pos(i.running);
}

/**
 * A phone over an operator plan's binding period: bought outright (less the old one sold) with a SIM-only plan,
 * against the plan that includes the phone, both with anything paid upfront.
 */
export function phonePlanComparison(i: { price: number; tradeIn?: number; simOnlyMonthly: number; bundledMonthly: number; bundledUpfront?: number; months: number }) {
  const months = Math.max(1, Math.round(pos(i.months)));
  const buy = Math.max(0, pos(i.price) - pos(i.tradeIn)) + pos(i.simOnlyMonthly) * months;
  const bundle = pos(i.bundledUpfront) - pos(i.tradeIn) + pos(i.bundledMonthly) * months;
  return { months, buy, bundle: Math.max(0, bundle), cheaper: buy <= bundle ? ('buy' as const) : ('bundle' as const), difference: Math.abs(buy - Math.max(0, bundle)) };
}
