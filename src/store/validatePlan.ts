import { FREQUENCIES } from '@/engine/frequency';
import { ACCOUNT_KINDS, GOAL_KINDS, INCOME_KINDS } from '@/engine/taxonomy';
import { EXPENSE_CATEGORIES, ONBOARDING_STEPS } from '@/engine/types';

type Check = (value: unknown) => boolean;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text: Check = (v) => typeof v === 'string';
const number: Check = (v) => typeof v === 'number' && Number.isFinite(v);
const flag: Check = (v) => typeof v === 'boolean';
const oneOf = (values: readonly string[]): Check => (v) => typeof v === 'string' && values.includes(v);
const array = (check: Check): Check => (v) => Array.isArray(v) && v.every(check);
const map = (check: Check): Check => (v) => record(v) && Object.values(v).every(check);
const shape = (required: Record<string, Check>, optional: Record<string, Check> = {}): Check => (v) =>
  record(v) && Object.entries(required).every(([key, check]) => check(v[key])) &&
  Object.entries(optional).every(([key, check]) => v[key] === undefined || check(v[key]));
const date: Check = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const timestamp: Check = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const currency: Check = (v) => typeof v === 'string' && /^[A-Z]{3}$/.test(v);
const frequency = oneOf(FREQUENCIES);
const range = shape({ low: number, high: number });
const common = { note: text, actuals: map(number), balances: map(number) };
const entities = (check: Check): Check => (v) => array(check)(v) &&
  new Set((v as { id: string }[]).map((e) => e.id)).size === (v as unknown[]).length;
const identity = { id: (v: unknown) => typeof v === 'string' && v.length > 0, name: text };
const spendGroup = oneOf(['food', 'transport', 'leisure', 'other']);
const merchantRule: Check = (v) => shape({ group: spendGroup })(v) ||
  shape({ expenseId: text }, { amount: number })(v) || shape({ action: oneOf(['ignore', 'transfer']) })(v);
const lineChoice: Check = (v) => shape({ group: spendGroup })(v) || shape({ expenseId: text })(v) ||
  shape({ potId: text })(v) || shape({ repays: text })(v) ||
  shape({ action: oneOf(['ignore', 'settled', 'lent']) }, { mine: number })(v);

const income = shape({ ...identity, amount: number, kind: oneOf(INCOME_KINDS.map((k) => k.id)), frequency,
  reliability: oneOf(['reliable', 'variable']), includeInBaseline: flag }, {
  ...common, destinationAccountId: text, bankMatch: shape({}, { counterparty: text, day: number }),
  gross: shape({ amount: number, taxYear: number, profile: shape({ churchMember: flag, over66: flag },
    { kommunCode: text, kommunalRate: number, churchRate: number }) }, { netOverridden: flag }),
});
const expense = shape({ ...identity, amount: number, category: oneOf(EXPENSE_CATEGORIES), subcategory: text,
  frequency, fixed: flag, essential: flag, committed: flag, tags: array(text) }, {
  ...common, currency, nextDate: date, includedElsewhere: flag, range, billingLag: number,
  brandDomain: text, icon: text, sharedWith: number, sharedBy: array(text),
  bankMatch: shape({ counterparty: text }, { amount: number }),
  occurrences: shape({ times: number, per: oneOf(['week', 'month', 'year']) }),
  tariff: shape({ part: oneOf(['supply', 'grid']), kwh: number, energyPrice: number, surcharge: number, monthlyFee: number },
    { kwhLow: number, kwhHigh: number, priceArea: oneOf(['SE1', 'SE2', 'SE3', 'SE4']), priceMonth: text, followSpot: flag }),
  priceLink: shape({ index: oneOf(['food']), base: shape({ amount: number }, { range }), baseMonth: text }, { month: text }),
});
const account = shape({ ...identity, balance: number, kind: oneOf(ACCOUNT_KINDS.map((k) => k.id)) }, {
  ...common, institution: text, institutionDomain: text, monthlyDeposit: number, cash: number,
  expectedReturn: number, interestRate: number, costBasis: number, fundShare: number, dividendYield: number,
  bank: shape({ provider: text, externalId: text }, { iban: text }),
  holdings: entities(shape({ ...identity, orderbookId: text, type: oneOf(['stock', 'etf', 'fund', 'certificate']),
    currency, quantity: number, avgPrice: number }, { isin: text, market: text, price: number, fx: number, priceAt: timestamp, dayChange: number })),
});
const goal = shape({ ...identity, kind: oneOf(GOAL_KINDS.map((k) => k.id)), purpose: oneOf(['future_spending', 'long_term']),
  currentAmount: number, monthlyContribution: number }, {
  ...common, description: text, targetAmount: number, targetDate: date, linkedAccountId: text, icon: text,
});
const debt = shape({ ...identity, kind: oneOf(['csn', 'mortgage', 'car', 'personal', 'credit_card', 'other']),
  balance: number, payment: number, frequency: oneOf(['monthly', 'quarterly', 'yearly']) }, {
  ...common, lender: text, rate: number, rateYear: number, secured: flag, nextDate: date, amortization: number,
  propertyValue: number, assetValue: number, rateType: oneOf(['variable', 'fixed']), rateFixedUntil: date,
  csnType: oneOf(['annuity', 'income_based']), csnBefore2022: flag,
});

/** Validate imported entities before they can replace the working plan. Older optional fields may be absent. */
export const validPlan: Check = shape({ version: (v) => v === 1, income: entities(income) }, {
  currency, userName: text, createdAt: timestamp, updatedAt: timestamp, avatar: text, birthYear: number, isSample: flag,
  home: shape({}, { kommunCode: text, priceArea: oneOf(['SE1', 'SE2', 'SE3', 'SE4']) }),
  expenses: entities(expense), accounts: entities(account), debts: entities(debt), goals: entities(goal),
  onboarding: shape({ completed: flag, completedSteps: array(oneOf(ONBOARDING_STEPS)) }),
  everydaySpend: map(map(shape({ amount: number }, { asOf: date, source: oneOf(['bank']) }))),
  everydayBudget: map(number), fx: map(map(number)),
  bank: shape({ provider: text, appId: text, sessions: entities(shape({ id: identity.id, aspsp: text, country: text,
    validUntil: timestamp, accounts: map(text) })) }, { merchants: map(merchantRule), lines: map(lineChoice), people: map(text), lentOut: number }),
  household: shape({ members: entities(shape({ id: identity.id,
    age: oneOf(['0', '1-3', '4-6', '7-10', '11-14', '15-17', '18-24', '25-50', '51-70', '71+']), lunchAway: flag })) }),
  commute: shape({ people: entities(shape({ ...identity, days: number, mode: oneOf(['public', 'car', 'active']), buysLunch: flag })) }, { prices: map(number) }),
  scenarios: entities(shape({ id: identity.id, name: text, tool: text, values: record, savedAt: timestamp })),
});
