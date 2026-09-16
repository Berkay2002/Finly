import { allMessages, messages } from '@/i18n';
import { frequencyForOccurrences } from './frequency';
import type {
  AccountKind,
  Debt,
  DebtFrequency,
  DebtKind,
  ExpenseCategory,
  ExpenseItem,
  ExpenseTag,
  Frequency,
  GoalKind,
  IncomeKind,
  Occurrences,
  OnboardingStep,
  Reliability,
  SavingsPurpose,
} from './types';

/*
 * Labels and descriptions are getters that read the current language's dictionary (src/i18n), so the
 * shapes below stay plain data for callers while the text follows the language.
 */
const tx = () => messages().taxonomy;

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

export interface CategoryMeta {
  id: ExpenseCategory;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
  /** Accent used for icon tiles and chart slices. */
  accent: 'blue' | 'green' | 'orange' | 'yellow' | 'purple' | 'lavender' | 'red' | 'indigo';
}

const category = (id: ExpenseCategory, accent: CategoryMeta['accent']): CategoryMeta => ({
  id,
  accent,
  get label() {
    return tx().categories[id].label;
  },
  get shortLabel() {
    return tx().categories[id].shortLabel;
  },
  get description() {
    return tx().categories[id].description;
  },
});

export const CATEGORY_META: Record<ExpenseCategory, CategoryMeta> = {
  home: category('home', 'blue'),
  living: category('living', 'green'),
  transport: category('transport', 'orange'),
  finance: category('finance', 'yellow'),
  leisure: category('leisure', 'purple'),
  planned: category('planned', 'lavender'),
};

/* ------------------------------------------------------------------ */
/* Suggested expense items per section                                 */
/* ------------------------------------------------------------------ */

export interface ExpenseSuggestion {
  slug: string;
  /** In the current language. */
  readonly name: string;
  category: ExpenseCategory;
  /** Stable group id (English); show it with `groupLabel`. */
  group: string;
  frequency: Frequency;
  fixed: boolean;
  essential: boolean;
  committed: boolean;
  tags?: ExpenseTag[];
  readonly hint?: string;
  /** Months the bill trails the period it covers. See `ExpenseItem.billingLag`. */
  billingLag?: number;
  /** Starts out priced per purchase. */
  occurrences?: Occurrences;
  /**
   * Bought often, in small amounts, with no invoice: groceries, coffee, fuel. Offered per purchase,
   * weekly or monthly, and never asked for as a bill to confirm. Items priced per purchase a few times
   * a year (flights, haircuts) are not everyday.
   */
  everyday?: boolean;
}

const s = (
  category: ExpenseCategory,
  group: string,
  slug: string,
  flags: {
    f?: boolean;
    e?: boolean;
    c?: boolean;
    freq?: Frequency;
    tags?: ExpenseTag[];
    lag?: number;
    /** Everyday purchase; see `ExpenseSuggestion.everyday`. */
    ev?: boolean;
    /** Priced per purchase: [times, per]. Implies `ev` unless per year. */
    occ?: [number, Occurrences['per']];
  } = {},
): ExpenseSuggestion => ({
  slug,
  get name() {
    return (tx().expenses as Record<string, string>)[slug] ?? slug;
  },
  category,
  group,
  frequency: flags.occ ? frequencyForOccurrences({ times: flags.occ[0], per: flags.occ[1] }) : (flags.freq ?? 'monthly'),
  fixed: flags.f ?? true,
  essential: flags.e ?? true,
  committed: flags.c ?? flags.f ?? true,
  tags: flags.tags,
  get hint() {
    return (tx().hints as Record<string, string | undefined>)[slug];
  },
  billingLag: flags.lag,
  occurrences: flags.occ ? { times: flags.occ[0], per: flags.occ[1] } : undefined,
  everyday: flags.ev || (!!flags.occ && flags.occ[1] !== 'year') || undefined,
});

export const EXPENSE_SUGGESTIONS: ExpenseSuggestion[] = [
  // Home
  s('home', 'Housing', 'rent'),
  s('home', 'Housing', 'hoa_fees'),
  s('home', 'Housing', 'property_charges'),
  s('home', 'Housing', 'home_insurance', { tags: ['insurance'] }),
  s('home', 'Utilities', 'electricity', {
    f: false,
    c: true,
    tags: ['utility'],
    lag: 1,
  }),
  s('home', 'Utilities', 'grid_fee', {
    f: false,
    c: true,
    tags: ['utility'],
    lag: 1,
  }),
  s('home', 'Utilities', 'gas', { f: false, c: true, tags: ['utility'], lag: 1 }),
  s('home', 'Utilities', 'heating', { f: false, c: true, tags: ['utility'], lag: 1 }),
  s('home', 'Utilities', 'water', { f: false, c: true, tags: ['utility'], lag: 1 }),
  s('home', 'Utilities', 'internet', { tags: ['utility', 'subscription'], lag: 1 }),
  s('home', 'Utilities', 'waste', { tags: ['utility'] }),
  s('home', 'Other', 'home_parking'),
  s('home', 'Other', 'maintenance', { f: false, e: false, c: false }),
  s('home', 'Other', 'other_housing', { f: false, c: false }),

  // Living
  s('living', 'Food & drink', 'groceries', { freq: 'weekly', f: false, c: false, ev: true }),
  s('living', 'Food & drink', 'restaurants', { occ: [2, 'month'], f: false, e: false, c: false }),
  s('living', 'Food & drink', 'takeaway', { occ: [1, 'week'], f: false, e: false, c: false }),
  s('living', 'Food & drink', 'cafes', { occ: [3, 'week'], f: false, e: false, c: false }),
  s('living', 'Food & drink', 'work_lunches', { occ: [5, 'week'], f: false, e: false, c: false }),
  s('living', 'Food & drink', 'alcohol', { freq: 'weekly', f: false, e: false, c: false, ev: true }),
  s('living', 'Household', 'cleaning', { f: false, c: false, ev: true }),
  s('living', 'Household', 'household_supplies', { f: false, c: false, ev: true }),
  s('living', 'Household', 'furniture', { f: false, e: false, c: false }),
  s('living', 'Clothing', 'clothes', { f: false, e: false, c: false }),
  s('living', 'Clothing', 'shoes', { f: false, e: false, c: false }),
  s('living', 'Clothing', 'accessories', { f: false, e: false, c: false }),
  s('living', 'Health & personal care', 'haircuts', { f: false, e: false, c: false, occ: [6, 'year'] }),
  s('living', 'Health & personal care', 'dental', { f: false, c: false, occ: [1, 'year'] }),
  s('living', 'Health & personal care', 'medicine', { f: false, c: false }),
  s('living', 'Health & personal care', 'personal_care', { f: false, e: false, c: false }),
  s('living', 'Work-related', 'union_fees'),
  s('living', 'Work-related', 'professional_memberships', { e: false }),
  s('living', 'Work-related', 'work_clothing', { f: false, c: false }),

  // Transport
  s('transport', 'Car', 'car_lease', { tags: ['car'] }),
  s('transport', 'Car', 'fuel', { f: false, c: false, tags: ['car'], ev: true }),
  s('transport', 'Car', 'ev_charging', { f: false, c: false, tags: ['car'], ev: true }),
  s('transport', 'Car', 'car_insurance', { tags: ['car', 'insurance'] }),
  s('transport', 'Car', 'vehicle_tax', { freq: 'yearly', tags: ['car'] }),
  s('transport', 'Car', 'car_maintenance', { f: false, c: false, tags: ['car'] }),
  s('transport', 'Car', 'car_service', { freq: 'yearly', f: false, c: false, tags: ['car'] }),
  s('transport', 'Car', 'car_repairs', { f: false, c: false, tags: ['car'] }),
  s('transport', 'Car', 'tyres', { freq: 'yearly', f: false, c: false, tags: ['car'] }),
  s('transport', 'Car', 'car_parking', { f: false, c: false, tags: ['car'], ev: true }),
  s('transport', 'Car', 'congestion', { f: false, c: false, tags: ['car'], occ: [10, 'week'] }),
  s('transport', 'Car', 'tolls', { f: false, c: false, tags: ['car'], occ: [2, 'month'] }),
  s('transport', 'Car', 'car_wash', { f: false, e: false, c: false, tags: ['car'], occ: [1, 'month'] }),
  s('transport', 'Public transport', 'travel_card', { tags: ['public_transport'] }),
  s('transport', 'Public transport', 'public_transport', { f: false, c: false, tags: ['public_transport'], occ: [4, 'week'] }),
  s('transport', 'Public transport', 'taxi', { f: false, e: false, c: false, occ: [2, 'month'] }),
  s('transport', 'Other travel', 'flights', { f: false, e: false, c: false, occ: [2, 'year'] }),
  s('transport', 'Other travel', 'long_distance', { f: false, e: false, c: false, occ: [2, 'year'] }),
  s('transport', 'Other travel', 'rental_cars', { f: false, e: false, c: false, occ: [1, 'year'] }),

  // Finance
  s('finance', 'Banking', 'bank_fees'),
  s('finance', 'Insurance', 'life_insurance', { tags: ['insurance'] }),
  s('finance', 'Insurance', 'health_insurance', { tags: ['insurance'] }),
  s('finance', 'Insurance', 'dental_insurance', { tags: ['insurance'] }),
  s('finance', 'Insurance', 'income_insurance', { tags: ['insurance'] }),
  s('finance', 'Insurance', 'loan_insurance', { tags: ['insurance'] }),
  s('finance', 'Other', 'other_financial'),

  // Leisure
  s('leisure', 'Entertainment', 'cinema', { f: false, e: false, c: false, occ: [1, 'month'] }),
  s('leisure', 'Entertainment', 'events', { f: false, e: false, c: false, occ: [4, 'year'] }),
  s('leisure', 'Entertainment', 'nights_out', { f: false, e: false, c: false, occ: [2, 'month'] }),
  s('leisure', 'Media & subscriptions', 'streaming', { e: false, c: false, tags: ['subscription'] }),
  s('leisure', 'Media & subscriptions', 'music', { e: false, c: false, tags: ['subscription'] }),
  s('leisure', 'Media & subscriptions', 'gaming_sub', { e: false, c: false, tags: ['subscription'] }),
  s('leisure', 'Media & subscriptions', 'software', { e: false, c: false, tags: ['subscription'] }),
  s('leisure', 'Media & subscriptions', 'news', { e: false, c: false, tags: ['subscription'] }),
  s('leisure', 'Media & subscriptions', 'mobile', { tags: ['subscription'] }),
  s('leisure', 'Hobbies', 'gaming', { f: false, e: false, c: false }),
  s('leisure', 'Hobbies', 'books', { f: false, e: false, c: false, occ: [1, 'month'] }),
  s('leisure', 'Hobbies', 'sports', { f: false, e: false, c: false }),
  s('leisure', 'Hobbies', 'creative', { f: false, e: false, c: false }),
  s('leisure', 'Hobbies', 'other_hobbies', { f: false, e: false, c: false }),
  s('leisure', 'Health & fitness', 'gym', { e: false, c: false, tags: ['subscription'] }),
  s('leisure', 'Health & fitness', 'fitness_classes', { f: false, e: false, c: false, occ: [1, 'week'] }),
  s('leisure', 'Health & fitness', 'sports_equipment', { f: false, e: false, c: false }),
  s('leisure', 'Other leisure', 'lottery', { f: false, e: false, c: false, occ: [1, 'week'] }),
  s('leisure', 'Other leisure', 'social', { f: false, e: false, c: false, ev: true }),
  s('leisure', 'Other leisure', 'misc_leisure', { f: false, e: false, c: false }),

  // Planned / irregular
  s('planned', 'Holidays & events', 'holidays', { freq: 'yearly', f: false, e: false, c: false }),
  s('planned', 'Holidays & events', 'christmas', { freq: 'yearly', f: false, e: false, c: false }),
  s('planned', 'Holidays & events', 'birthdays', { f: false, e: false, c: false, occ: [4, 'year'] }),
  s('planned', 'Holidays & events', 'gifts', { freq: 'yearly', f: false, e: false, c: false }),
  s('planned', 'Holidays & events', 'planned_events', { freq: 'yearly', f: false, e: false, c: false }),
  s('planned', 'Purchases', 'electronics', { freq: 'yearly', f: false, e: false, c: false }),
  s('planned', 'Purchases', 'planned_furniture', { freq: 'yearly', f: false, e: false, c: false }),
  s('planned', 'Purchases', 'clothing_purchases', { freq: 'yearly', f: false, e: false, c: false }),
  s('planned', 'Purchases', 'home_purchases', { freq: 'yearly', f: false, e: false, c: false }),
  s('planned', 'Purchases', 'large_one_off', { freq: 'once', f: true, e: false, c: false }),
  s('planned', 'Annual bills', 'annual_subscriptions', { freq: 'yearly', tags: ['subscription'], e: false }),
  s('planned', 'Annual bills', 'annual_insurance', { freq: 'yearly', tags: ['insurance'] }),
  s('planned', 'Annual bills', 'annual_car_service', { freq: 'yearly', f: false, c: false, tags: ['car'] }),
];

export function suggestionsFor(category: ExpenseCategory): ExpenseSuggestion[] {
  return EXPENSE_SUGGESTIONS.filter((x) => x.category === category);
}

export function suggestionBySlug(slug: string): ExpenseSuggestion | undefined {
  return EXPENSE_SUGGESTIONS.find((x) => x.slug === slug);
}

/** Everyday spending: priced per purchase weekly or monthly, or a taxonomy item bought often with no invoice. */
export function isEverydaySpend(e: { subcategory: string; occurrences?: Occurrences }): boolean {
  if (e.occurrences) return e.occurrences.per !== 'year';
  return !!suggestionBySlug(e.subcategory)?.everyday;
}

/** A suggestion group's name in the current language. */
export function groupLabel(group: string): string {
  return (tx().groups as Record<string, string>)[group] ?? group;
}

/**
 * An expense's name for display. A suggested item still carrying its default name, in any language,
 * shows the default in the current language; a name the person typed is shown as is.
 */
export function expenseName(item: Pick<ExpenseItem, 'name' | 'subcategory'>): string {
  const names = allMessages().map((m) => (m.taxonomy.expenses as Record<string, string>)[item.subcategory]);
  return names.includes(item.name) ? (suggestionBySlug(item.subcategory)?.name ?? item.name) : item.name;
}

/** Groups in display order for a category. */
export function groupsFor(category: ExpenseCategory): string[] {
  const out: string[] = [];
  for (const sug of suggestionsFor(category)) {
    if (!out.includes(sug.group)) out.push(sug.group);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Income kinds                                                        */
/* ------------------------------------------------------------------ */

export interface IncomeKindMeta {
  id: IncomeKind;
  readonly label: string;
  reliability: Reliability;
  frequency: Frequency;
}

const income = (id: IncomeKind, reliability: Reliability, frequency: Frequency): IncomeKindMeta => ({
  id,
  reliability,
  frequency,
  get label() {
    return tx().incomeKinds[id];
  },
});

export const INCOME_KINDS: IncomeKindMeta[] = [
  income('salary', 'reliable', 'monthly'),
  income('pension', 'reliable', 'monthly'),
  income('benefits', 'reliable', 'monthly'),
  income('tax_credit', 'reliable', 'monthly'),
  income('government', 'reliable', 'monthly'),
  income('other_recurring', 'reliable', 'monthly'),
  income('self_employment', 'variable', 'monthly'),
  income('freelance', 'variable', 'monthly'),
  income('side_job', 'variable', 'monthly'),
  income('overtime', 'variable', 'monthly'),
  income('bonus', 'variable', 'yearly'),
  income('commission', 'variable', 'monthly'),
  income('investment_income', 'variable', 'yearly'),
  income('other_irregular', 'variable', 'yearly'),
];

export function incomeKindMeta(kind: IncomeKind): IncomeKindMeta {
  return INCOME_KINDS.find((k) => k.id === kind) ?? INCOME_KINDS[0];
}

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

export type AccountRole = 'everyday' | 'cash_savings' | 'emergency' | 'investment' | 'other';

export interface AccountKindMeta {
  id: AccountKind;
  readonly label: string;
  role: AccountRole;
  readonly description: string;
  /** Kept for accounts saved before the tax wrappers existed; not offered for new accounts. */
  legacy?: boolean;
}

const account = (id: AccountKind, role: AccountRole, legacy?: boolean): AccountKindMeta => ({
  id,
  role,
  ...(legacy ? { legacy } : {}),
  get label() {
    return tx().accountKinds[id].label;
  },
  get description() {
    return tx().accountKinds[id].description;
  },
});

export const ACCOUNT_KINDS: AccountKindMeta[] = [
  account('everyday', 'everyday'),
  account('salary', 'everyday'),
  account('joint', 'everyday'),
  account('savings', 'cash_savings'),
  account('cash', 'cash_savings'),
  account('emergency', 'emergency'),
  account('isk', 'investment'),
  account('kf', 'investment'),
  account('af', 'investment'),
  account('investment', 'investment', true),
  account('other', 'other'),
];

export function accountRole(kind: AccountKind): AccountRole {
  return ACCOUNT_KINDS.find((k) => k.id === kind)?.role ?? 'other';
}

export function accountKindMeta(kind: AccountKind): AccountKindMeta {
  return ACCOUNT_KINDS.find((k) => k.id === kind) ?? ACCOUNT_KINDS[ACCOUNT_KINDS.length - 1];
}

/* ------------------------------------------------------------------ */
/* Loans                                                               */
/* ------------------------------------------------------------------ */

export interface DebtKindMeta {
  id: DebtKind;
  readonly label: string;
  /** Default name for a new loan of this kind. */
  readonly name: string;
  readonly description: string;
  frequency: DebtFrequency;
  /** Default for car and other loans; mortgages are always secured, the rest never. */
  secured: boolean;
}

const debt = (id: DebtKind, frequency: DebtFrequency, secured: boolean): DebtKindMeta => ({
  id,
  frequency,
  secured,
  get label() {
    return tx().debtKinds[id].label;
  },
  get name() {
    return tx().debtKinds[id].name;
  },
  get description() {
    return tx().debtKinds[id].description;
  },
});

export const DEBT_KINDS: DebtKindMeta[] = [
  debt('csn', 'quarterly', false),
  debt('mortgage', 'monthly', true),
  debt('car', 'monthly', true),
  debt('personal', 'monthly', false),
  debt('credit_card', 'monthly', false),
  debt('other', 'monthly', false),
];

export function debtKindMeta(kind: DebtKind): DebtKindMeta {
  return DEBT_KINDS.find((k) => k.id === kind) ?? DEBT_KINDS[DEBT_KINDS.length - 1];
}

/** A loan's name for display: a default name saved in any language shows in the current one. */
export function debtName(d: Pick<Debt, 'name' | 'kind'>): string {
  const names = allMessages().map((m) => m.taxonomy.debtKinds[d.kind].name);
  return names.includes(d.name) ? debtKindMeta(d.kind).name : d.name;
}

/* ------------------------------------------------------------------ */
/* Goals                                                               */
/* ------------------------------------------------------------------ */

export interface GoalKindMeta {
  id: GoalKind;
  readonly label: string;
  purpose: SavingsPurpose;
  readonly description: string;
}

const goal = (id: GoalKind, purpose: SavingsPurpose): GoalKindMeta => ({
  id,
  purpose,
  get label() {
    return tx().goalKinds[id].label;
  },
  get description() {
    return tx().goalKinds[id].description;
  },
});

export const GOAL_KINDS: GoalKindMeta[] = [
  goal('emergency', 'long_term'),
  goal('general', 'long_term'),
  goal('investment', 'long_term'),
  goal('pension', 'long_term'),
  goal('purchase', 'future_spending'),
  goal('custom', 'future_spending'),
];

export function goalKindMeta(kind: GoalKind): GoalKindMeta {
  return GOAL_KINDS.find((k) => k.id === kind) ?? GOAL_KINDS[GOAL_KINDS.length - 1];
}

/* ------------------------------------------------------------------ */
/* Onboarding steps                                                    */
/* ------------------------------------------------------------------ */

export interface StepMeta {
  id: OnboardingStep;
  readonly label: string;
  readonly shortLabel: string;
  readonly title: string;
  readonly description: string;
  category?: ExpenseCategory;
}

const step = (id: OnboardingStep, category?: ExpenseCategory): StepMeta => ({
  id,
  ...(category ? { category } : {}),
  get label() {
    return tx().steps[id].label;
  },
  get shortLabel() {
    return tx().steps[id].shortLabel;
  },
  get title() {
    return tx().steps[id].title;
  },
  get description() {
    return tx().steps[id].description;
  },
});

export const STEP_META: Record<OnboardingStep, StepMeta> = {
  income: step('income'),
  home: step('home', 'home'),
  living: step('living', 'living'),
  transport: step('transport', 'transport'),
  finance: step('finance', 'finance'),
  leisure: step('leisure', 'leisure'),
  planned: step('planned', 'planned'),
  savings: step('savings'),
  accounts: step('accounts'),
  summary: step('summary'),
};
