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
  /** Required to maintain basic obligations vs optional. */
  essential: boolean;
  /** Hard to change in the short term vs realistically adjustable. */
  committed: boolean;
  tags: ExpenseTag[];
  /** e.g. a utility bundled into rent: kept visible but excluded from totals. */
  includedElsewhere?: boolean;
}

export type AccountKind =
  | 'everyday'
  | 'salary'
  | 'savings'
  | 'emergency'
  | 'joint'
  | 'cash'
  | 'investment'
  | 'other';

export interface Account {
  id: string;
  name: string;
  institution?: string;
  kind: AccountKind;
  /** Current balance. */
  balance: number;
  /** Balance as last entered in each month (YYYY-MM), so net worth has a history. */
  balances?: Record<string, number>;
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
  currentAmount: number;
  /** `currentAmount` as last entered in each month (YYYY-MM), so goal progress has a history. */
  balances?: Record<string, number>;
  monthlyContribution: number;
  targetAmount?: number;
  /** ISO date (YYYY-MM-DD). */
  targetDate?: string;
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

export interface FinancialPlan {
  version: 1;
  currency: string;
  userName: string;
  /** Profile picture as a small JPEG data URL (see `lib/image.ts`). Syncs with the plan; not kept in frozen months. */
  avatar?: string;
  income: IncomeSource[];
  expenses: ExpenseItem[];
  accounts: Account[];
  goals: SavingsGoal[];
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
    goals: [],
    onboarding: { completedSteps: [], completed: false },
    createdAt: iso,
    updatedAt: iso,
  };
}
