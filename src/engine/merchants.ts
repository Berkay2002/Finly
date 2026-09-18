import type { SpendGroup } from './types';

/**
 * Swedish chains as they appear on a card line after `normalizeParty` (upper case, letters and digits
 * only, no spaces) and often cut to twelve characters by the bank: "ICANARASTR", "HEMKOPNORRK",
 * "MAXIICASTO", "LIDL164NORRK", "OSTGOTATRAFI", "SLAPP". Patterns are prefixes that survive the cut.
 * Anything not here is sorted once by the user and remembered; a user's rule beats this list.
 */
// The third field is the Food & drink item (taxonomy slug) the chain belongs on when the plan has one.
const RULES: [RegExp, SpendGroup, string?][] = [
  // Delivery before ride-hailing: UBEREAT is food, UBER is transport.
  [/^(UBEREAT|FOODORA|WOLT)/, 'food', 'takeaway'],
  // Groceries and drink
  [/^(ICA|MAXIICA|HEMKOP|COOP|LIDL|WILLYS|CITYGROSS|TEMPO|MATOPPET)/, 'food', 'groceries'],
  [/^SYSTEMBOL/, 'food', 'alcohol'],
  // Eating out: chains by prefix, then words most restaurants, cafés and bars carry in their name
  [/^(ESPRESSOHOU|WAYNES|PRESSBYR|7ELEVEN)/, 'food', 'cafes'],
  [/^(MAXBURG|MCD|BURGERKING|SUBWAY|SIBYLLA|OLEARYS)/, 'food', 'restaurants'],
  [/CAFE|KAFE|BAGERI|BAKF|KONDITORI/, 'food', 'cafes'],
  [/PIZZA|SUSHI|KEBAB|THAI|PASTA|BURGER|RESTAURANG|SPORTBAR|GRILL|WOK|BISTRO|KROG|PUB$|BAR$/, 'food', 'restaurants'],
  // Public transport, rail, taxi, micromobility
  [/^(SLAPP|SJAPP|SJAB|SJ\d|OSTGOTATRAFI|VASTTRAFIK|SKANETRAFIK|MTR|SNALLTAGET|MALARDALSTRA|XTRAFIK|LANSTRAFIK|FLIXBUS|UBER|BOLT|TAXI|VOI|TIER|LIME)/, 'transport'],
  // Fuel, parking, charging
  [/^(OKQ8|CIRCLEK|PREEM|ST1|INGO|SHELL|TANKA|EASYPARK|PARKSTER|APCOA|QPARK|APARK|MOBILITY46|RECHARGE)/, 'transport'],
];

/** The item (taxonomy slug) a chain belongs on, when Finly knows it: ICA is groceries, Foodora is takeaway. */
export function bundledItem(merchantKey: string): string | undefined {
  return RULES.find(([re]) => re.test(merchantKey))?.[2];
}

/** The group a merchant belongs to when Finly already knows the chain, else undefined. */
export function bundledGroup(merchantKey: string): SpendGroup | undefined {
  return RULES.find(([re]) => re.test(merchantKey))?.[1];
}

/** Klarna, PayPal and the like: one monthly statement the bank cannot see into. */
export const PASS_THROUGH_LABEL = { KLARNA: 'Klarna', PAYPAL: 'PayPal', QLIRO: 'Qliro', WALLEY: 'Walley', TRUSTLY: 'Trustly' } as const;
export type PassThroughBrand = keyof typeof PASS_THROUGH_LABEL;

export function passThroughBrand(merchantKey: string): PassThroughBrand | undefined {
  return (Object.keys(PASS_THROUGH_LABEL) as PassThroughBrand[]).find((brand) => merchantKey.includes(brand));
}

export function isPassThrough(merchantKey: string): boolean {
  return passThroughBrand(merchantKey) !== undefined;
}
