import type {
  AccountKind,
  ExpenseCategory,
  ExpenseTag,
  Frequency,
  GoalKind,
  IncomeKind,
  OnboardingStep,
  Reliability,
  SavingsPurpose,
} from './types';

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

export interface CategoryMeta {
  id: ExpenseCategory;
  label: string;
  shortLabel: string;
  description: string;
  /** Accent used for icon tiles and chart slices. */
  accent: 'blue' | 'green' | 'orange' | 'yellow' | 'purple' | 'lavender' | 'red' | 'indigo';
}

export const CATEGORY_META: Record<ExpenseCategory, CategoryMeta> = {
  home: {
    id: 'home',
    label: 'Home & Bills',
    shortLabel: 'Home',
    description: 'Rent, mortgage, utilities and everything that keeps a roof over your head.',
    accent: 'blue',
  },
  living: {
    id: 'living',
    label: 'Living Costs',
    shortLabel: 'Living costs',
    description: 'Food, household, clothing, health and personal care.',
    accent: 'green',
  },
  transport: {
    id: 'transport',
    label: 'Transport',
    shortLabel: 'Transport',
    description: 'Car ownership, public transport and travel.',
    accent: 'orange',
  },
  finance: {
    id: 'finance',
    label: 'Finance & Insurance',
    shortLabel: 'Finance & insurance',
    description: 'Loans, credit, banking fees and insurance policies.',
    accent: 'yellow',
  },
  leisure: {
    id: 'leisure',
    label: 'Leisure',
    shortLabel: 'Leisure',
    description: 'Entertainment, subscriptions, hobbies and fitness.',
    accent: 'purple',
  },
  planned: {
    id: 'planned',
    label: 'Planned Spending',
    shortLabel: 'Planned',
    description: 'Irregular and one-off costs, spread into a monthly equivalent.',
    accent: 'lavender',
  },
};

/* ------------------------------------------------------------------ */
/* Suggested expense items per section                                 */
/* ------------------------------------------------------------------ */

export interface ExpenseSuggestion {
  slug: string;
  name: string;
  category: ExpenseCategory;
  group: string;
  frequency: Frequency;
  fixed: boolean;
  essential: boolean;
  committed: boolean;
  tags?: ExpenseTag[];
  hint?: string;
  /** Months the bill trails the period it covers. See `ExpenseItem.billingLag`. */
  billingLag?: number;
}

const s = (
  category: ExpenseCategory,
  group: string,
  slug: string,
  name: string,
  flags: {
    f?: boolean;
    e?: boolean;
    c?: boolean;
    freq?: Frequency;
    tags?: ExpenseTag[];
    hint?: string;
    lag?: number;
  } = {},
): ExpenseSuggestion => ({
  slug,
  name,
  category,
  group,
  frequency: flags.freq ?? 'monthly',
  fixed: flags.f ?? true,
  essential: flags.e ?? true,
  committed: flags.c ?? flags.f ?? true,
  tags: flags.tags,
  hint: flags.hint,
  billingLag: flags.lag,
});

export const EXPENSE_SUGGESTIONS: ExpenseSuggestion[] = [
  // Home
  s('home', 'Housing', 'rent', 'Rent'),
  s('home', 'Housing', 'mortgage', 'Mortgage payment', { tags: ['debt'] }),
  s('home', 'Housing', 'mortgage_interest', 'Mortgage interest', { tags: ['debt'] }),
  s('home', 'Housing', 'hoa_fees', 'Housing association fees'),
  s('home', 'Housing', 'property_charges', 'Property charges'),
  s('home', 'Housing', 'home_insurance', 'Home insurance', { tags: ['insurance'] }),
  s('home', 'Utilities', 'electricity', 'Electricity', {
    f: false,
    c: true,
    tags: ['utility'],
    lag: 1,
    hint: 'Usage is billed the month after',
  }),
  s('home', 'Utilities', 'grid_fee', 'Elnät (grid fee)', {
    f: false,
    c: true,
    tags: ['utility'],
    lag: 1,
    hint: 'E.ON, Vattenfall, Ellevio…',
  }),
  s('home', 'Utilities', 'gas', 'Gas', { f: false, c: true, tags: ['utility'], lag: 1 }),
  s('home', 'Utilities', 'heating', 'Heating', { f: false, c: true, tags: ['utility'], lag: 1 }),
  s('home', 'Utilities', 'water', 'Water', { f: false, c: true, tags: ['utility'], lag: 1 }),
  s('home', 'Utilities', 'internet', 'Internet', { tags: ['utility', 'subscription'], lag: 1 }),
  s('home', 'Utilities', 'waste', 'Waste collection', { tags: ['utility'] }),
  s('home', 'Other', 'home_parking', 'Parking at home'),
  s('home', 'Other', 'maintenance', 'Maintenance', { f: false, e: false, c: false }),
  s('home', 'Other', 'other_housing', 'Other housing costs', { f: false, c: false }),

  // Living
  s('living', 'Food & drink', 'groceries', 'Groceries', { f: false, c: false }),
  s('living', 'Food & drink', 'restaurants', 'Restaurants', { f: false, e: false, c: false }),
  s('living', 'Food & drink', 'takeaway', 'Takeaway', { f: false, e: false, c: false }),
  s('living', 'Food & drink', 'cafes', 'Cafés', { f: false, e: false, c: false }),
  s('living', 'Food & drink', 'work_lunches', 'Work lunches', { f: false, e: false, c: false }),
  s('living', 'Food & drink', 'alcohol', 'Alcohol at home', { f: false, e: false, c: false }),
  s('living', 'Household', 'cleaning', 'Cleaning products', { f: false, c: false }),
  s('living', 'Household', 'household_supplies', 'Household supplies', { f: false, c: false }),
  s('living', 'Household', 'furniture', 'Furniture & small purchases', { f: false, e: false, c: false }),
  s('living', 'Clothing', 'clothes', 'Clothes', { f: false, e: false, c: false }),
  s('living', 'Clothing', 'shoes', 'Shoes', { f: false, e: false, c: false }),
  s('living', 'Clothing', 'accessories', 'Accessories', { f: false, e: false, c: false }),
  s('living', 'Health & personal care', 'haircuts', 'Haircuts', { f: false, e: false, c: false }),
  s('living', 'Health & personal care', 'dental', 'Dental care', { f: false, c: false }),
  s('living', 'Health & personal care', 'medicine', 'Medicine', { f: false, c: false }),
  s('living', 'Health & personal care', 'personal_care', 'Personal care & beauty', { f: false, e: false, c: false }),
  s('living', 'Work-related', 'union_fees', 'Union fees'),
  s('living', 'Work-related', 'professional_memberships', 'Professional memberships', { e: false }),
  s('living', 'Work-related', 'work_clothing', 'Work clothing', { f: false, c: false }),

  // Transport
  s('transport', 'Car', 'car_finance', 'Car finance / loan', { tags: ['car', 'debt'] }),
  s('transport', 'Car', 'car_lease', 'Car lease', { tags: ['car'] }),
  s('transport', 'Car', 'fuel', 'Fuel', { f: false, c: false, tags: ['car'] }),
  s('transport', 'Car', 'ev_charging', 'Electric charging', { f: false, c: false, tags: ['car'] }),
  s('transport', 'Car', 'car_insurance', 'Car insurance', { tags: ['car', 'insurance'] }),
  s('transport', 'Car', 'vehicle_tax', 'Vehicle tax', { freq: 'yearly', tags: ['car'] }),
  s('transport', 'Car', 'car_maintenance', 'Maintenance provision', { f: false, c: false, tags: ['car'] }),
  s('transport', 'Car', 'car_service', 'Servicing', { freq: 'yearly', f: false, c: false, tags: ['car'] }),
  s('transport', 'Car', 'car_repairs', 'Repairs', { f: false, c: false, tags: ['car'] }),
  s('transport', 'Car', 'tyres', 'Tyres', { freq: 'yearly', f: false, c: false, tags: ['car'] }),
  s('transport', 'Car', 'car_parking', 'Parking', { f: false, c: false, tags: ['car'] }),
  s('transport', 'Car', 'congestion', 'Congestion charges', { f: false, c: false, tags: ['car'] }),
  s('transport', 'Car', 'tolls', 'Tolls & road charges', { f: false, c: false, tags: ['car'] }),
  s('transport', 'Car', 'car_wash', 'Car washing', { f: false, e: false, c: false, tags: ['car'] }),
  s('transport', 'Public transport', 'travel_card', 'Monthly travel card', { tags: ['public_transport'] }),
  s('transport', 'Public transport', 'public_transport', 'Bus, tram, metro, train', { f: false, c: false, tags: ['public_transport'] }),
  s('transport', 'Public transport', 'taxi', 'Taxi & ride sharing', { f: false, e: false, c: false }),
  s('transport', 'Other travel', 'flights', 'Flights', { freq: 'yearly', f: false, e: false, c: false }),
  s('transport', 'Other travel', 'long_distance', 'Long-distance rail & ferry', { freq: 'yearly', f: false, e: false, c: false }),
  s('transport', 'Other travel', 'rental_cars', 'Rental cars', { freq: 'yearly', f: false, e: false, c: false }),

  // Finance
  s('finance', 'Debt', 'personal_loan', 'Personal loan', { tags: ['debt'] }),
  s('finance', 'Debt', 'credit_card', 'Credit card repayment', { tags: ['debt'] }),
  s('finance', 'Debt', 'student_loan', 'Student loan', { tags: ['debt'] }),
  s('finance', 'Debt', 'other_debt', 'Other debt repayment', { tags: ['debt'] }),
  s('finance', 'Banking', 'bank_fees', 'Banking fees'),
  s('finance', 'Insurance', 'life_insurance', 'Life insurance', { tags: ['insurance'] }),
  s('finance', 'Insurance', 'health_insurance', 'Health insurance', { tags: ['insurance'] }),
  s('finance', 'Insurance', 'dental_insurance', 'Dental insurance', { tags: ['insurance'] }),
  s('finance', 'Insurance', 'income_insurance', 'Income insurance', { tags: ['insurance'] }),
  s('finance', 'Insurance', 'loan_insurance', 'Loan insurance', { tags: ['insurance'] }),
  s('finance', 'Other', 'other_financial', 'Other financial commitments'),

  // Leisure
  s('leisure', 'Entertainment', 'cinema', 'Cinema', { f: false, e: false, c: false }),
  s('leisure', 'Entertainment', 'events', 'Events & concerts', { f: false, e: false, c: false }),
  s('leisure', 'Entertainment', 'nights_out', 'Nights out', { f: false, e: false, c: false }),
  s('leisure', 'Media & subscriptions', 'streaming', 'Streaming services', { e: false, c: false, tags: ['subscription'] }),
  s('leisure', 'Media & subscriptions', 'music', 'Music subscription', { e: false, c: false, tags: ['subscription'] }),
  s('leisure', 'Media & subscriptions', 'gaming_sub', 'Gaming subscription', { e: false, c: false, tags: ['subscription'] }),
  s('leisure', 'Media & subscriptions', 'software', 'Software subscriptions', { e: false, c: false, tags: ['subscription'] }),
  s('leisure', 'Media & subscriptions', 'news', 'News subscription', { e: false, c: false, tags: ['subscription'] }),
  s('leisure', 'Media & subscriptions', 'mobile', 'Mobile phone plan', { tags: ['subscription'] }),
  s('leisure', 'Hobbies', 'gaming', 'Gaming', { f: false, e: false, c: false }),
  s('leisure', 'Hobbies', 'books', 'Books', { f: false, e: false, c: false }),
  s('leisure', 'Hobbies', 'sports', 'Sports', { f: false, e: false, c: false }),
  s('leisure', 'Hobbies', 'creative', 'Creative hobbies', { f: false, e: false, c: false }),
  s('leisure', 'Hobbies', 'other_hobbies', 'Other hobbies', { f: false, e: false, c: false }),
  s('leisure', 'Health & fitness', 'gym', 'Gym membership', { e: false, c: false, tags: ['subscription'] }),
  s('leisure', 'Health & fitness', 'fitness_classes', 'Fitness classes', { f: false, e: false, c: false }),
  s('leisure', 'Health & fitness', 'sports_equipment', 'Training equipment', { f: false, e: false, c: false }),
  s('leisure', 'Other leisure', 'lottery', 'Lottery & games', { f: false, e: false, c: false }),
  s('leisure', 'Other leisure', 'social', 'Social spending', { f: false, e: false, c: false }),
  s('leisure', 'Other leisure', 'misc_leisure', 'Miscellaneous leisure', { f: false, e: false, c: false }),

  // Planned / irregular
  s('planned', 'Holidays & events', 'holidays', 'Holidays', { freq: 'yearly', f: false, e: false, c: false, hint: 'Expected annual total' }),
  s('planned', 'Holidays & events', 'christmas', 'Christmas', { freq: 'yearly', f: false, e: false, c: false }),
  s('planned', 'Holidays & events', 'birthdays', 'Birthdays', { freq: 'yearly', f: false, e: false, c: false }),
  s('planned', 'Holidays & events', 'gifts', 'Gifts', { freq: 'yearly', f: false, e: false, c: false }),
  s('planned', 'Holidays & events', 'planned_events', 'Events', { freq: 'yearly', f: false, e: false, c: false }),
  s('planned', 'Purchases', 'electronics', 'Electronics', { freq: 'yearly', f: false, e: false, c: false }),
  s('planned', 'Purchases', 'planned_furniture', 'Furniture', { freq: 'yearly', f: false, e: false, c: false }),
  s('planned', 'Purchases', 'clothing_purchases', 'Seasonal clothing', { freq: 'yearly', f: false, e: false, c: false }),
  s('planned', 'Purchases', 'home_purchases', 'Home purchases', { freq: 'yearly', f: false, e: false, c: false }),
  s('planned', 'Purchases', 'large_one_off', 'Large one-off purchase', { freq: 'once', f: true, e: false, c: false }),
  s('planned', 'Annual bills', 'annual_subscriptions', 'Annual subscriptions', { freq: 'yearly', tags: ['subscription'], e: false }),
  s('planned', 'Annual bills', 'annual_insurance', 'Annual insurance', { freq: 'yearly', tags: ['insurance'] }),
  s('planned', 'Annual bills', 'annual_car_service', 'Annual car service', { freq: 'yearly', f: false, c: false, tags: ['car'] }),
];

export function suggestionsFor(category: ExpenseCategory): ExpenseSuggestion[] {
  return EXPENSE_SUGGESTIONS.filter((x) => x.category === category);
}

export function suggestionBySlug(slug: string): ExpenseSuggestion | undefined {
  return EXPENSE_SUGGESTIONS.find((x) => x.slug === slug);
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
  label: string;
  reliability: Reliability;
  frequency: Frequency;
}

export const INCOME_KINDS: IncomeKindMeta[] = [
  { id: 'salary', label: 'Salary', reliability: 'reliable', frequency: 'monthly' },
  { id: 'pension', label: 'Pension', reliability: 'reliable', frequency: 'monthly' },
  { id: 'benefits', label: 'Benefits', reliability: 'reliable', frequency: 'monthly' },
  { id: 'tax_credit', label: 'Tax credits', reliability: 'reliable', frequency: 'monthly' },
  { id: 'government', label: 'Government payments', reliability: 'reliable', frequency: 'monthly' },
  { id: 'other_recurring', label: 'Other recurring income', reliability: 'reliable', frequency: 'monthly' },
  { id: 'self_employment', label: 'Self-employment', reliability: 'variable', frequency: 'monthly' },
  { id: 'freelance', label: 'Freelancing', reliability: 'variable', frequency: 'monthly' },
  { id: 'side_job', label: 'Side job', reliability: 'variable', frequency: 'monthly' },
  { id: 'overtime', label: 'Overtime', reliability: 'variable', frequency: 'monthly' },
  { id: 'bonus', label: 'Bonus', reliability: 'variable', frequency: 'yearly' },
  { id: 'commission', label: 'Commission', reliability: 'variable', frequency: 'monthly' },
  { id: 'investment_income', label: 'Investment income', reliability: 'variable', frequency: 'yearly' },
  { id: 'other_irregular', label: 'Other irregular income', reliability: 'variable', frequency: 'yearly' },
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
  label: string;
  role: AccountRole;
  description: string;
}

export const ACCOUNT_KINDS: AccountKindMeta[] = [
  { id: 'everyday', label: 'Everyday account', role: 'everyday', description: 'Day-to-day spending money' },
  { id: 'salary', label: 'Salary account', role: 'everyday', description: 'Where income lands' },
  { id: 'joint', label: 'Joint account', role: 'everyday', description: 'Shared spending account' },
  { id: 'savings', label: 'Savings account', role: 'cash_savings', description: 'Cash set aside' },
  { id: 'cash', label: 'Cash savings', role: 'cash_savings', description: 'Physical cash or similar' },
  { id: 'emergency', label: 'Emergency fund', role: 'emergency', description: 'Reserved for the unexpected' },
  { id: 'investment', label: 'Investment account', role: 'investment', description: 'Funds, shares, ISK' },
  { id: 'other', label: 'Other account', role: 'other', description: 'Anything else you track' },
];

export function accountRole(kind: AccountKind): AccountRole {
  return ACCOUNT_KINDS.find((k) => k.id === kind)?.role ?? 'other';
}

export function accountKindMeta(kind: AccountKind): AccountKindMeta {
  return ACCOUNT_KINDS.find((k) => k.id === kind) ?? ACCOUNT_KINDS[ACCOUNT_KINDS.length - 1];
}

/* ------------------------------------------------------------------ */
/* Goals                                                               */
/* ------------------------------------------------------------------ */

export interface GoalKindMeta {
  id: GoalKind;
  label: string;
  purpose: SavingsPurpose;
  description: string;
}

export const GOAL_KINDS: GoalKindMeta[] = [
  { id: 'emergency', label: 'Emergency savings', purpose: 'long_term', description: 'Cash for unexpected situations' },
  { id: 'general', label: 'General savings', purpose: 'long_term', description: 'No specific purpose yet' },
  { id: 'investment', label: 'Investments', purpose: 'long_term', description: 'Funds, shares, long-term growth' },
  { id: 'pension', label: 'Pension / retirement', purpose: 'long_term', description: 'Private retirement savings' },
  { id: 'purchase', label: 'Saving for a purchase', purpose: 'future_spending', description: 'Holiday, car, electronics, wedding…' },
  { id: 'custom', label: 'Custom goal', purpose: 'future_spending', description: 'Anything else' },
];

export function goalKindMeta(kind: GoalKind): GoalKindMeta {
  return GOAL_KINDS.find((k) => k.id === kind) ?? GOAL_KINDS[GOAL_KINDS.length - 1];
}

/* ------------------------------------------------------------------ */
/* Onboarding steps                                                    */
/* ------------------------------------------------------------------ */

export interface StepMeta {
  id: OnboardingStep;
  label: string;
  shortLabel: string;
  title: string;
  description: string;
  category?: ExpenseCategory;
}

export const STEP_META: Record<OnboardingStep, StepMeta> = {
  income: {
    id: 'income',
    label: 'Income',
    shortLabel: 'Income',
    title: 'Your income',
    description: 'Add your regular income and any variable income. This helps us understand how much you have to work with each month.',
  },
  home: {
    id: 'home',
    label: 'Home',
    shortLabel: 'Home',
    title: 'Home & bills',
    description: 'Rent or mortgage, utilities and other costs of keeping your home running.',
    category: 'home',
  },
  living: {
    id: 'living',
    label: 'Living Costs',
    shortLabel: 'Living',
    title: 'Living costs',
    description: 'Food, household, clothing, health and everyday personal spending.',
    category: 'living',
  },
  transport: {
    id: 'transport',
    label: 'Transport',
    shortLabel: 'Transport',
    title: 'Transport',
    description: 'Car ownership costs, public transport and travel.',
    category: 'transport',
  },
  finance: {
    id: 'finance',
    label: 'Finance & Insurance',
    shortLabel: 'Finance',
    title: 'Finance & insurance',
    description: 'Loan repayments, credit, banking fees and insurance.',
    category: 'finance',
  },
  leisure: {
    id: 'leisure',
    label: 'Leisure',
    shortLabel: 'Leisure',
    title: 'Lifestyle & leisure',
    description: 'Entertainment, subscriptions, hobbies and fitness. Everything that makes life enjoyable.',
    category: 'leisure',
  },
  planned: {
    id: 'planned',
    label: 'Planned Spending',
    shortLabel: 'Planned',
    title: 'Irregular & planned spending',
    description: 'Costs that do not happen every month. We spread them into a monthly equivalent so they never surprise you.',
    category: 'planned',
  },
  savings: {
    id: 'savings',
    label: 'Savings & Investments',
    shortLabel: 'Savings',
    title: 'Savings & investments',
    description: 'What you are saving for, how much you already have and what you put aside each month.',
  },
  accounts: {
    id: 'accounts',
    label: 'Accounts',
    shortLabel: 'Accounts',
    title: 'Current money & accounts',
    description: 'Where your money is right now. Balances stay separate so spending money is never confused with savings.',
  },
  summary: {
    id: 'summary',
    label: 'Summary',
    shortLabel: 'Summary',
    title: 'Your financial summary',
    description: 'Here is how we understand your finances. Review and correct anything before continuing.',
  },
};
