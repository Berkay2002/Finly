/**
 * Core data model. Everything the product knows about the user's financial life
 * lives in one FinancialPlan. Amounts are stored exactly as entered together with
 * their frequency; monthly equivalents are always computed, never stored.
 */

export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'once';

export type Reliability = 'reliable' | 'variable';

export type IncomeKind =
  | 'salary'
  | 'self_employment'
  | 'freelance'
  | 'side_job'
  | 'overtime'
  | 'bonus'
  | 'commission'
  | 'pension'
  | 'benefits'
  | 'tax_credit'
  | 'government'
  | 'investment_income'
  | 'other_recurring'
  | 'other_irregular';

/**
 * Gross (before-tax) entry for a salary. `IncomeSource.amount` always stays the net figure the
 * budget runs on; this block records where that net came from so it can be recomputed when the
 * gross, the tax profile or the tax year changes.
 */
export interface GrossIncome {
  /** Gross amount per period, same frequency as the income source. */
  amount: number;
  /** Income year whose rules produced the current net. */
  taxYear: number;
  profile: SwedishTaxProfile;
  /**
   * Set when the user typed a net figure to match their payslip. The engine then leaves `amount`
   * alone until gross or profile changes again.
   */
  netOverridden?: boolean;
}

/** See engine/tax/sweden.ts. Kept here so plan files stay self-describing. */
export interface SwedishTaxProfile {
  kommunCode?: string;
  kommunalRate?: number;
  churchMember: boolean;
  churchRate?: number;
  over66: boolean;
}

export interface IncomeSource {
  id: string;
  name: string;
  note?: string;
  kind: IncomeKind;
  /** Net amount per period (what lands in the account). */
  amount: number;
  frequency: Frequency;
  reliability: Reliability;
  /** Whether this income counts towards the baseline budget. */
  includeInBaseline: boolean;
  /** Present when the user entered a before-tax salary. */
  gross?: GrossIncome;
  /** The account this is normally paid into. Only used to find it among bank transactions. */
  destinationAccountId?: string;
  /** How the payment shows up at the bank, learnt when the user points one out. */
  bankMatch?: IncomeBankMatch;
  /**
   * What actually arrived, keyed by the month it counts for (YYYY-MM). `amount` stays what is normally
   * expected: one bigger or smaller payment never rewrites the plan.
   */
  actuals?: Record<string, number>;
}

export interface IncomeBankMatch {
  /** The sender as the bank writes it, e.g. 'ERICSSON AB'. */
  counterparty?: string;
  /** Usual day of the month it arrives. */
  day?: number;
}

/** How a bill or subscription shows up at the bank, learnt when the user points a payment out. */
export interface ExpenseBankMatch {
  /** The payee as the bank writes it, e.g. 'FORTUM MARKETS AB' or 'K*KLARNA'. */
  counterparty: string;
  /** The usual amount, for a payee that carries several things (Klarna, PayPal). */
  amount?: number;
}

export type ExpenseCategory = 'home' | 'living' | 'transport' | 'finance' | 'leisure' | 'planned';

export type ExpenseTag = 'car' | 'subscription' | 'debt' | 'insurance' | 'utility' | 'public_transport';

/**
 * Expected spread of a variable cost, per period and in the same frequency as `amount`.
 * A bill on a floating tariff (electricity on "rörligt pris", fuel, groceries) is not one number
 * but a band; the budget runs on the typical figure while the band feeds the best/worst-case view.
 * Either bound may be left at 0 to mean "same as the typical amount".
 */
export interface AmountRange {
  low: number;
  high: number;
}

/** Nord Pool bidding area. Spot prices differ between them, most in winter. */
export type PriceArea = 'SE1' | 'SE2' | 'SE3' | 'SE4';

/** `supply` is the elhandel bill, `grid` the elnät bill. */
export type TariffPart = 'supply' | 'grid';

/**
 * How an electricity bill is calculated, so the budget can run on usage × price instead of a guessed
 * range. See engine/electricity.ts. Prices include moms.
 */
export interface ElectricityTariff {
  part: TariffPart;
  /** Average usage per month, kWh. */
  kwh: number;
  /** Usage in a light (summer) and a heavy (winter) month, kWh. Optional; they set the range. */
  kwhLow?: number;
  kwhHigh?: number;
  /** öre/kWh. Supply: average spot price. Grid: överföringsavgift. */
  energyPrice: number;
  /** öre/kWh. Supply: påslag (incl. elcertifikat). Grid: energiskatt. */
  surcharge: number;
  /** kr/month. Supply: månadsavgift. Grid: abonnemang, plus any effektavgift. */
  monthlyFee: number;
  /** Supply only: price area and month (YYYY-MM) of the spot price, when it came from the price feed. */
  priceArea?: PriceArea;
  priceMonth?: string;
  /**
   * Supply only: keep `energyPrice` at the newest complete month's average for `priceArea`, fetched
   * when the app opens (store/usePriceRefresh.ts), so the bill follows the market on its own.
   */
  followSpot?: boolean;
}

/**
 * A cost that moves with a public price series instead of sitting still: groceries follow SCB's food
 * price index. `base` is the figure at `baseMonth`; the live `amount` is that times the index move
 * since, recomputed from the base whenever a newer month arrives (engine/priceLinks.ts), never
 * compounded. Editing the amount by hand makes the new figure the base.
 */
export interface PriceLink {
  index: 'food';
  base: { amount: number; range?: AmountRange };
  /** YYYY-MM the base figure was priced at. */
  baseMonth: string;
  /** YYYY-MM whose prices the current amount reflects; unset until the first refresh. */
  month?: string;
}

/**
 * A cost priced per purchase rather than per period: one lunch, one coffee, one takeaway. People know
 * what a lunch costs and how many they buy a week far better than what lunches add up to in a month.
 */
export interface Occurrences {
  /** Purchases per `per`. May be fractional (1.5 a week). */
  times: number;
  per: 'week' | 'month' | 'year';
}

export interface ExpenseItem {
  id: string;
  name: string;
  note?: string;
  category: ExpenseCategory;
  /** Slug from the taxonomy, or 'custom'. */
  subcategory: string;
  /**
   * Typical amount per period. For a variable item with a `range` this is the figure the plan
   * budgets for; leave it at 0 to budget for the midpoint of the range.
   */
  amount: number;
  frequency: Frequency;
  /**
   * Currency `amount` and `range` are in, when not the plan's (a subscription billed in EUR). The engine converts
   * at the rate of the month being computed (engine/fx.ts), so the same bill costs more in a month the krona is
   * weak. `actuals` stay in the plan currency: they are what left the account.
   */
  currency?: string;
  /**
   * Priced per purchase. While set, `amount` and `range` are what one purchase costs and `frequency`
   * mirrors `per` (weekly, monthly or yearly). Such an item has no due date: a yearly one is spread
   * over the months like any other regular cost. See engine/frequency.ts.
   */
  occurrences?: Occurrences;
  /** ISO date (YYYY-MM-DD) of the next occurrence. Used for non-monthly items. */
  nextDate?: string;
  /** Fixed amount each period vs variable amount. Only variable items honour `range`. */
  fixed: boolean;
  /** Expected low and high per period. Ignored while `fixed` is true. */
  range?: AmountRange;
  /**
   * Months between the period a bill covers and the month it is paid. Swedish utilities
   * (el, elnät, internet) usually bill in arrears: January's usage is invoiced in mid-February
   * and paid at the end of February, so the lag is 1. Fixed items ignore this.
   */
  billingLag?: number;
  /**
   * Real bills once they are known, keyed by the month they are paid (YYYY-MM). A variable
   * estimate is only a placeholder; when the electricity bill lands the month should run on
   * that figure instead.
   */
  actuals?: Record<string, number>;
  /**
   * Electricity and elnät only: calculate the bill from usage and prices. While set, it decides the
   * amount and range and the item is treated as a monthly variable cost.
   */
  tariff?: ElectricityTariff;
  /** Follow a price index (see `PriceLink`). Not combined with `tariff`. */
  priceLink?: PriceLink;
  /** Required to maintain basic obligations vs optional. */
  essential: boolean;
  /** Hard to change in the short term vs realistically adjustable. */
  committed: boolean;
  tags: ExpenseTag[];
  /** e.g. a utility bundled into rent: kept visible but excluded from totals. */
  includedElsewhere?: boolean;
  /** Company logo for subscriptions: the brand domain picked from search, rendered by Logo.dev. */
  brandDomain?: string;
  /** How the payment shows up at the bank. Set from the sort sheet; the bank then fills `actuals`. */
  bankMatch?: ExpenseBankMatch;
}

/**
 * Loans are not expenses. A payment is partly interest (a cost) and partly repayment (it shrinks what
 * you owe), the balance belongs in net worth, and each Swedish loan type follows its own rules. See
 * engine/debts.ts and docs/swedish-loans.md.
 */
export type DebtKind = 'csn' | 'mortgage' | 'car' | 'personal' | 'credit_card' | 'other';

/**
 * CSN rules by when the money was paid out. `annuity`: from July 2001, a yearly amount (årsbelopp) set
 * by CSN. `income_based`: 1989 to June 2001, 4 % of the income from two years earlier.
 */
export type CsnLoanType = 'annuity' | 'income_based';

export type DebtFrequency = 'monthly' | 'quarterly' | 'yearly';

export type MortgageRateType = 'variable' | 'fixed';

export interface Debt {
  id: string;
  name: string;
  lender?: string;
  note?: string;
  kind: DebtKind;
  /** Remaining debt. 0 while not entered. */
  balance: number;
  /** Balance as last entered in each month (YYYY-MM), so net worth has a history. */
  balances?: Record<string, number>;
  /** Nominal yearly interest rate in percent (3.85 means 3.85 %). Undefined while not entered. */
  rate?: number;
  /**
   * CSN: the year `rate` applies to. CSN's rate changes every January, so forecasts move `rate` by CSN's
   * change from this year on. Missing on loans saved before it existed: taken as the current year.
   */
  rateYear?: number;
  /** Car and other loans: secured against what was bought. Mortgages always are; CSN, personal loans and credit cards never. */
  secured?: boolean;
  /**
   * What is paid on each due date, in `frequency`. For CSN this is the årsbelopp split over the
   * schedule. A mortgage with balance, rate and amortisation ignores it and pays amortisation + interest.
   */
  payment: number;
  frequency: DebtFrequency;
  /**
   * ISO date (YYYY-MM-DD) of the next payment, for quarterly and yearly schedules. More than one period
   * away means repayment has not started yet: nothing is paid before then and interest builds up.
   */
  nextDate?: string;
  /** Mortgage: amortering per month. */
  amortization?: number;
  /** Mortgage: market value of the home, for loan-to-value, the amortisation requirement and net worth. */
  propertyValue?: number;
  /** Car loans, and other loans with security: what the car or property is worth today, for net worth. */
  assetValue?: number;
  /**
   * Mortgage: rörlig (follows the market, usually reset every three months) or bunden (fixed until
   * `rateFixedUntil`). Missing on mortgages saved before the choice existed: a date means bunden.
   */
  rateType?: MortgageRateType;
  /** Mortgage with a bunden ränta: villkorsändringsdag, when the fixed period ends (YYYY-MM-DD). */
  rateFixedUntil?: string;
  /** CSN only. */
  csnType?: CsnLoanType;
  /** CSN annuitetslån: every loan paid out before 2022, so repaid by 60 instead of 64. */
  csnBefore2022?: boolean;
}

export type AccountKind =
  | 'everyday'
  | 'salary'
  | 'savings'
  | 'emergency'
  | 'joint'
  | 'cash'
  /** Investeringssparkonto. Taxed on its value each year (schablonskatt), not on gains. */
  | 'isk'
  /** Kapitalförsäkring. Like ISK, but the insurer takes the tax from the account. */
  | 'kf'
  /** Aktie- och fondkonto (depå). 30 % tax on gains when sold and on dividends. */
  | 'af'
  /** An investment account whose tax wrapper has not been chosen (saved before ISK, KF and AF existed). */
  | 'investment'
  | 'other';

/** A link to a real bank account. Present only while connected; the account's `kind` is unaffected. */
export interface AccountBankLink {
  /** Who reads the bank, e.g. 'enable-banking'. Metadata: nothing in the engine branches on it. */
  provider: string;
  /** The provider's stable id for the bank account, the same across sessions and devices. */
  externalId: string;
  /** Lets a transfer that names this account be told from income or spending. */
  iban?: string;
}

/** An authorised reading session at a bank. Useless without the private key, which stays on the device. */
export interface BankSession {
  id: string;
  /** The bank's name as the provider lists it. */
  aspsp: string;
  country: string;
  /** ISO timestamp the consent runs out; after it the bank asks for a new login. */
  validUntil: string;
  /** `AccountBankLink.externalId` → the id the session reads that account under. */
  accounts: Record<string, string>;
}

/** What a payee's lines are, once the user has said: everyday spending in a group, a bill, money between own accounts, or nothing to count. */
export type MerchantRule = { group: SpendGroup } | { expenseId: string } | { action: 'ignore' | 'transfer' };

/** One line sorted on its own, for payees that carry different things each time (Klarna, PayPal). */
export type LineChoice = { group: SpendGroup } | { expenseId: string } | { action: 'ignore' };

export interface BankSetup {
  provider: string;
  /** The user's own application id at the provider. */
  appId: string;
  sessions: BankSession[];
  /** By normalised payee (see `merchantKey`). Synced with the plan so every device sorts alike. */
  merchants?: Record<string, MerchantRule>;
  /** By transaction id. Pruned to the months the device keeps. */
  lines?: Record<string, LineChoice>;
}

export interface Account {
  id: string;
  name: string;
  institution?: string;
  /** A logo picked for the institution; without it a known bank's logo is used (see `bankDomain`). */
  institutionDomain?: string;
  kind: AccountKind;
  /** Current balance. */
  balance: number;
  /** Balance as last entered in each month (YYYY-MM), so net worth has a history. */
  balances?: Record<string, number>;
  /** ISK, KF, AF: expected yearly return before tax, percent. */
  expectedReturn?: number;
  /** Cash accounts: yearly interest before tax, percent. */
  interestRate?: number;
  /** Money put in each month; a goal linked to the account reads its contribution from here. */
  monthlyDeposit?: number;
  /** AF: what the holdings cost (anskaffningsvärde), for the gain and the tax if sold. */
  costBasis?: number;
  /** AF: percent of the value held in funds (taxed 0.12 % a year); the rest is shares. Default 100. */
  fundShare?: number;
  /** AF: yearly dividend yield on the shares part, percent. Default 0. */
  dividendYield?: number;
  /** ISK, KF, AF: what the account holds. When set, `balance` is derived: `cash` + the holdings at their last price. */
  holdings?: Holding[];
  /** Uninvested money on an account with holdings. */
  cash?: number;
  /** Set while the balance is read from a bank; without it the balance is typed in by hand. */
  bank?: AccountBankLink;
}

export type HoldingType = 'stock' | 'etf' | 'fund' | 'certificate';

/** A position on an investment account, priced from Avanza or Nordnet (Yahoo as backup) by `usePriceRefresh`. */
export interface Holding {
  id: string;
  /** Avanza's orderbook id, or `nn` + Nordnet's instrument id for funds only Nordnet lists. */
  orderbookId: string;
  /** For the Yahoo backup; filled in on the first price refresh. */
  isin?: string;
  name: string;
  type: HoldingType;
  /** Where it trades, e.g. "Stockholmsbörsen", or "Nordnet" for a fund only Nordnet lists. */
  market?: string;
  /** The instrument's own currency; `avgPrice` and `price` are in it. */
  currency: string;
  quantity: number;
  /** Average purchase price (GAV). */
  avgPrice: number;
  /** Last known price. */
  price?: number;
  /** One unit of `currency` in the plan currency at the last refresh. */
  fx?: number;
  /** ISO date the price last moved. */
  priceAt?: string;
  /** Today's move at the last refresh, as a fraction (0.012 = +1.2 %). */
  dayChange?: number;
}

export type GoalKind = 'emergency' | 'general' | 'investment' | 'purchase' | 'pension' | 'custom';

/** PRD §2.4: planned future spending vs long-term wealth. */
export type SavingsPurpose = 'future_spending' | 'long_term';

export interface SavingsGoal {
  id: string;
  name: string;
  description?: string;
  kind: GoalKind;
  purpose: SavingsPurpose;
  /** Saved so far. 0 while linked to an account, whose balance is the amount (see `savingsPots`). */
  currentAmount: number;
  /** `currentAmount` as last entered in each month (YYYY-MM), so goal progress has a history. */
  balances?: Record<string, number>;
  /** 0 while linked to an account, whose `monthlyDeposit` is the contribution. */
  monthlyContribution: number;
  targetAmount?: number;
  /** ISO date (YYYY-MM-DD). */
  targetDate?: string;
  /** The account holding the money, at most one goal per account. */
  linkedAccountId?: string;
  icon?: string;
}

export type OnboardingStep =
  | 'income'
  | 'home'
  | 'living'
  | 'transport'
  | 'finance'
  | 'leisure'
  | 'planned'
  | 'savings'
  | 'accounts'
  | 'summary';

/** Where the household lives. Salary tax and electricity costs both depend on it. */
export interface HomeLocation {
  /** Four-digit kommun code, e.g. "0581" for Norrköping. */
  kommunCode?: string;
  /**
   * Chosen electricity price area. Only needed where the kommun does not settle it (see
   * `priceAreaFor`); when left out the area follows the kommun.
   */
  priceArea?: PriceArea;
}

/** Konsumentverket's age bands for food costs. See engine/food.ts. */
export type AgeGroup = '0' | '1-3' | '4-6' | '7-10' | '11-14' | '15-17' | '18-24' | '25-50' | '51-70' | '71+';

export type Sex = 'female' | 'male';

/** Physical activity level, relative to the median person Konsumentverket's menu feeds (`average`). */
export type ActivityLevel = 'low' | 'average' | 'high' | 'veryHigh';

export type WeightGoal = 'lose' | 'maintain' | 'gain';

export type Diet = 'omnivore' | 'flexitarian' | 'pescatarian' | 'vegetarian' | 'vegan' | 'highProtein' | 'lowCarb';

/** Where the household shops: discount chains, a normal supermarket, or premium and organic. */
export type ShoppingStyle = 'budget' | 'normal' | 'premium';

export interface HouseholdMember {
  id: string;
  age: AgeGroup;
  /** Eats weekday lunch away from home: school lunch, or lunch bought at work. */
  lunchAway: boolean;
  /* The rest is optional detail for the personalised estimate; see engine/foodProfile.ts. */
  sex?: Sex;
  /** Exact age for the energy need; the age band's midpoint is used when left out. */
  birthYear?: number;
  heightCm?: number;
  weightKg?: number;
  activity?: ActivityLevel;
  goal?: WeightGoal;
  diet?: Diet;
  /** Gluten- or lactose-free products, which cost more. */
  freeFrom?: boolean;
}

/** Who the household feeds. Used to estimate groceries. */
export interface Household {
  members: HouseholdMember[];
  shopping?: ShoppingStyle;
  /** Whether the groceries estimate is personalised from the members' detail, or is Konsumentverket's plain figure. */
  personalised?: boolean;
}

/**
 * What was really spent on a kind of everyday spending in a month, as read off the bank app. Everyday
 * spending has no invoice to confirm, so the month gets one total instead of a bill per item.
 */
export interface SpendEntry {
  amount: number;
  /**
   * YYYY-MM-DD the total runs to while the month is still going. Absent once it covers the whole
   * month, which is also what a figure entered after the month ended means.
   */
  asOf?: string;
  /** Summed from bank transactions; a total typed by hand has no source and is never overwritten by the bank. */
  source?: 'bank';
}

/** Everyday spending logged as one total per month. See engine/everyday.ts. */
export type SpendGroup = 'food' | 'transport' | 'leisure';

export type CommuteMode = 'public' | 'car' | 'active';

/** One person's trips to work or school. */
export interface Commuter {
  id: string;
  name: string;
  /** Days a week travelling in. May be fractional (2.5 for every other Friday). */
  days: number;
  /** `active` is walking or cycling. */
  mode: CommuteMode;
  /** Public transport: a period card, or a single ticket each way. */
  ticket?: 'card' | 'single';
  /** Car: pays for parking on days in. */
  parking?: boolean;
  /** Car: trängselskatt passages on a day in (Stockholm and Göteborg). */
  passages?: number;
  /** Buys lunch on days in. */
  buysLunch: boolean;
}

/**
 * How the household gets to work or school. One answer sets the counts of several items: lunches,
 * tickets or cards, parking and congestion charges. See engine/commute.ts.
 */
export interface Commute {
  people: Commuter[];
  /** Price of one of each, kept so a switch (single tickets to a card) still knows the other price. */
  prices?: Partial<Record<CommutePrice, number>>;
}

export type CommutePrice = 'lunch' | 'ticket' | 'card' | 'parking' | 'passage';

/** A "Can I afford this?" question kept for later: which tool, and what was typed into it. */
export interface SavedScenario {
  id: string;
  /** An `AffordTab`: a purchase kind or 'monthly'. */
  tool: string;
  name: string;
  values: Record<string, unknown>;
  savedAt: string;
}

export interface FinancialPlan {
  version: 1;
  currency: string;
  userName: string;
  /** Profile picture as a small JPEG data URL (see `lib/image.ts`). Syncs with the plan; not kept in frozen months. */
  avatar?: string;
  /** Year the user was born. Optional; sets how long CSN gives to repay (the age limit). */
  birthYear?: number;
  home?: HomeLocation;
  household?: Household;
  commute?: Commute;
  /** Everyday spending logged per month (YYYY-MM), by kind. */
  everydaySpend?: Partial<Record<SpendGroup, Record<string, SpendEntry>>>;
  income: IncomeSource[];
  expenses: ExpenseItem[];
  accounts: Account[];
  /** Optional bank connectivity. Absent for a plan kept by hand; no calculation reads it. */
  bank?: BankSetup;
  /** Missing on plans saved before loans had their own model; see `migrateLegacyDebts`. */
  debts?: Debt[];
  goals: SavingsGoal[];
  /** "Can I afford this?" scenarios saved to come back to. */
  scenarios?: SavedScenario[];
  /** Exchange rates by month for expenses in other currencies; see engine/fx.ts. Refreshed by `usePriceRefresh`. */
  fx?: Record<string, Record<string, number>>;
  onboarding: {
    completedSteps: OnboardingStep[];
    completed: boolean;
  };
  /** True while the plan is the built-in demo and has not been adopted by the user. */
  isSample?: boolean;
  createdAt: string;
  updatedAt: string;
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'home',
  'living',
  'transport',
  'finance',
  'leisure',
  'planned',
];

export const ONBOARDING_STEPS: OnboardingStep[] = [
  'income',
  'home',
  'living',
  'transport',
  'finance',
  'leisure',
  'planned',
  'savings',
  'accounts',
  'summary',
];

export function emptyPlan(now: Date = new Date()): FinancialPlan {
  const iso = now.toISOString();
  return {
    version: 1,
    currency: 'SEK',
    userName: '',
    income: [],
    expenses: [],
    accounts: [],
    debts: [],
    goals: [],
    onboarding: { completedSteps: [], completed: false },
    createdAt: iso,
    updatedAt: iso,
  };
}
