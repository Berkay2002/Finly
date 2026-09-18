import type { SpendGroup } from './types';

/**
 * Swedish chains as they appear on a card line after `normalizeParty` (upper case, letters and digits
 * only, no spaces) and often cut to twelve characters by the bank: "ICANARASTR", "HEMKOPNORRK",
 * "MAXIICASTO", "LIDL164NORRK", "OSTGOTATRAFI", "SLAPP". Patterns are prefixes that survive the cut.
 * Anything not here is sorted once by the user and remembered; a user's rule beats this list.
 */
const RULES: [RegExp, SpendGroup][] = [
  // Delivery before ride-hailing: UBEREAT is food, UBER is transport.
  [/^(UBEREAT|FOODORA|WOLT)/, 'food'],
  // Groceries and drink
  [/^(ICA|MAXIICA|HEMKOP|COOP|LIDL|WILLYS|CITYGROSS|TEMPO|MATOPPET|SYSTEMBOL)/, 'food'],
  // Eating out: chains by prefix, then words most restaurants, cafés and bars carry in their name
  [/^(MAXBURG|MCD|BURGERKING|ESPRESSOHOU|WAYNES|PRESSBYR|7ELEVEN|SUBWAY|SIBYLLA|OLEARYS)/, 'food'],
  [/PIZZA|SUSHI|KEBAB|THAI|PASTA|BURGER|CAFE|KAFE|BAGERI|BAKF|KONDITORI|RESTAURANG|SPORTBAR|GRILL|WOK|BISTRO|KROG|PUB$|BAR$/, 'food'],
  // Public transport, rail, taxi, micromobility
  [/^(SLAPP|SJAPP|SJAB|SJ\d|OSTGOTATRAFI|VASTTRAFIK|SKANETRAFIK|MTR|SNALLTAGET|MALARDALSTRA|XTRAFIK|LANSTRAFIK|FLIXBUS|UBER|BOLT|TAXI|VOI|TIER|LIME)/, 'transport'],
  // Fuel, parking, charging
  [/^(OKQ8|CIRCLEK|PREEM|ST1|INGO|SHELL|TANKA|EASYPARK|PARKSTER|APCOA|QPARK|APARK|MOBILITY46|RECHARGE)/, 'transport'],
];

/** The group a merchant belongs to when Finly already knows the chain, else undefined. */
export function bundledGroup(merchantKey: string): SpendGroup | undefined {
  return RULES.find(([re]) => re.test(merchantKey))?.[1];
}

/** Klarna, PayPal and the like carry different things every time, so a rule for the payee makes no sense. */
export function isPassThrough(merchantKey: string): boolean {
  return /KLARNA|PAYPAL|QLIRO|WALLEY|TRUSTLY/.test(merchantKey);
}
