import { addMonths, startOfMonth } from 'date-fns';
import { messages } from '@/i18n';
import { AMORTIZATION_TIERS, interestTaxReduction } from './debts';
import { toMonthly } from './frequency';
import { computeMetrics, monthKeyOf, type PlanMetrics } from './metrics';
import { allGoalProgress, monthsAhead, projectPlan, type GoalProgress } from './projections';
import type { GovBondRate } from './rates';
import { isSavingsAccount, landingAccount } from './savings';
import { accountRole, type AccountRole } from './taxonomy';
import { capitalTaxSummary } from './tax/capital';
import type { AccountKind, AmountRange, ExpenseCategory, FinancialPlan, Frequency } from './types';

/* ------------------------------------------------------------------ */
/* Scenario definitions                                                */
/* ------------------------------------------------------------------ */

export interface RecurringExpenseScenario {
  type: 'add_expense';
  name: string;
  /** Typical amount per period; the plan budgets for this. */
  amount: number;
  /** Optional expected spread for a cost that varies, e.g. a floating-rate electricity plan. */
  range?: AmountRange;
  frequency: Frequency;
  category: ExpenseCategory;
  essential: boolean;
  committed: boolean;
}

export interface IncomeChangeScenario {
  type: 'income_change';
  /** Source to change; omit to apply to all baseline income. */
  sourceId?: string;
  mode: 'percent' | 'absolute' | 'set' | 'remove';
  /** Percent as e.g. 10 for +10 %, −20 for −20 %. Absolute in currency per month. */
  value: number;
}

export type Scenario = RecurringExpenseScenario | IncomeChangeScenario;

/* ------------------------------------------------------------------ */
/* Applying                                                            */
/* ------------------------------------------------------------------ */

export function applyScenario(plan: FinancialPlan, scenario: Scenario): FinancialPlan {
  if (scenario.type === 'add_expense') {
    return {
      ...plan,
      expenses: [
        ...plan.expenses,
        {
          id: '__scenario__',
          name: scenario.name || messages().planning.newExpense,
          category: scenario.category,
          subcategory: 'custom',
          amount: scenario.amount,
          frequency: scenario.frequency,
          fixed: !scenario.range,
          range: scenario.range,
          essential: scenario.essential,
          committed: scenario.committed,
          tags: [],
        },
      ],
    };
  }

  const targets = scenario.sourceId
    ? plan.income.filter((i) => i.id === scenario.sourceId)
    : plan.income.filter((i) => i.includeInBaseline);
  const ids = new Set(targets.map((i) => i.id));

  return {
    ...plan,
    income: plan.income.map((src) => {
      if (!ids.has(src.id)) return src;
      switch (scenario.mode) {
        case 'remove':
          return { ...src, amount: 0 };
        case 'percent':
          return { ...src, amount: src.amount * (1 + scenario.value / 100) };
        case 'absolute': {
          // value is per month; convert to the source's own frequency
          return { ...src, amount: Math.max(0, src.amount + scenario.value / toMonthly(1, src.frequency)) };
        }
        case 'set': {
          return { ...src, amount: Math.max(0, scenario.value / toMonthly(1, src.frequency)) };
        }
      }
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Comparison                                                          */
/* ------------------------------------------------------------------ */

export interface MetricDelta {
  key: string;
  label: string;
  before: number;
  after: number;
  delta: number;
  unit: 'money' | 'months' | 'percent';
}

export interface GoalImpact {
  goal: GoalProgress['goal'];
  before: GoalProgress;
  after: GoalProgress;
  delayMonths: number;
}

export interface ScenarioResult {
  before: PlanMetrics;
  after: PlanMetrics;
  deltas: MetricDelta[];
  /** How much planned saving would have to shrink to keep breathing room ≥ 0. */
  savingsShortfall: number;
  goals: GoalImpact[];
}

export function runScenario(plan: FinancialPlan, scenario: Scenario, now: Date = new Date()): ScenarioResult {
  const before = computeMetrics(plan, now);
  const afterPlan = applyScenario(plan, scenario);
  const after = computeMetrics(afterPlan, now);
  const t = messages().planning.deltas;

  const deltas: MetricDelta[] = [
    d('safeToSpend', t.safeToSpend, before.safeToSpend, after.safeToSpend, 'money'),
    d('breathingRoom', t.breathingRoom, before.breathingRoom, after.breathingRoom, 'money'),
    d('flexible', t.flexible, before.expenses.flexible, after.expenses.flexible, 'money'),
    d('savings', t.savings, before.savings.total, after.savings.total, 'money'),
    d('savingsRate', t.savingsRate, before.savings.rate, after.savings.rate, 'percent'),
    d('lifestyle', t.lifestyle, before.lifestyleCost, after.lifestyleCost, 'money'),
    d('essential', t.essential, before.essentialCost, after.essentialCost, 'money'),
    d('income', t.income, before.income.total, after.income.total, 'money'),
    d(
      'essentialRunway',
      t.essentialRunway,
      before.resilience.essentialRunwayMonths,
      after.resilience.essentialRunwayMonths,
      'months',
    ),
    d(
      'lifestyleRunway',
      t.lifestyleRunway,
      before.resilience.lifestyleRunwayMonths,
      after.resilience.lifestyleRunwayMonths,
      'months',
    ),
  ];

  // If breathing room goes negative, savings would realistically have to absorb it.
  const savingsShortfall = after.breathingRoom < 0 ? Math.min(-after.breathingRoom, after.savings.total) : 0;
  const goalsBefore = allGoalProgress(plan, now);
  let goals: GoalImpact[] = [];
  if (savingsShortfall > 0 && after.savings.total > 0) {
    const factor = (after.savings.total - savingsShortfall) / after.savings.total;
    const reducedPlan: FinancialPlan = {
      ...afterPlan,
      goals: afterPlan.goals.map((g) => ({ ...g, monthlyContribution: g.monthlyContribution * factor })),
      accounts: afterPlan.accounts.map((a) => (a.monthlyDeposit ? { ...a, monthlyDeposit: a.monthlyDeposit * factor } : a)),
    };
    const goalsAfter = allGoalProgress(reducedPlan, now);
    goals = goalsBefore.map((b, i) => {
      const a = goalsAfter[i];
      const delay =
        Number.isFinite(a.monthsToTarget) && Number.isFinite(b.monthsToTarget)
          ? a.monthsToTarget - b.monthsToTarget
          : Number.isFinite(b.monthsToTarget)
            ? Infinity
            : 0;
      return { goal: b.goal, before: b, after: a, delayMonths: delay };
    });
  } else {
    goals = goalsBefore.map((b) => ({ goal: b.goal, before: b, after: b, delayMonths: 0 }));
  }

  return { before, after, deltas, savingsShortfall, goals };
}

function d(key: string, label: string, before: number, after: number, unit: MetricDelta['unit']): MetricDelta {
  return { key, label, before, after, delta: after - before, unit };
}

/* ------------------------------------------------------------------ */
/* One-off purchase                                                    */
/* ------------------------------------------------------------------ */

/** How many months a purchase is checked against: its own month and the eleven after it. */
const WINDOW = 12;
/** How far ahead the earliest month that fits is looked for. */
const SEARCH_MONTHS = 60;

export interface PurchaseResult {
  /** Name of the account the purchase is paid from. */
  account: string;
  /** Month of the purchase (1st). */
  month: Date;
  /** Landing account today. */
  landingNow: number;
  /** Landing account at the end of the purchase month, without and with the purchase. */
  landingBefore: number;
  landingAfter: number;
  /** Lowest landing balance with the purchase over the window from its month. */
  lowest: { month: Date; balance: number };
  /** The most that could be paid in that month without the landing account dipping below 0 over the window. */
  room: number;
  /** What would have to come from savings to keep the landing account at 0 or above. */
  shortBy: number;
  /** Essential runway in the purchase month, without and with the purchase. */
  runwayBefore: number;
  runwayAfter: number;
  /** Cash and emergency savings in the purchase month, before it (what runway counts). */
  savings: number;
  /** First month from now the purchase fits without taking the landing account below 0; null within five years. */
  earliest: Date | null;
}

/**
 * A one-off purchase paid from the landing account, judged against the plan rolled forward (`projectPlan`):
 * each month's leftover and dated one-offs move that balance, and the purchase lowers it from its month on.
 */
export function purchaseImpact(plan: FinancialPlan, purchase: { amount: number; date: Date }, now: Date = new Date(), gov?: GovBondRate): PurchaseResult {
  const start = startOfMonth(now);
  const at = (i: number) => addMonths(start, i);
  const projected = projectPlan(plan, now, at(SEARCH_MONTHS + WINDOW - 1), gov);
  const landing = landingAccount(projected)!;
  // ponytail: the lost interest on the spent amount is ignored; add it if landing accounts earn real interest.
  const b = (i: number) => landing.balances?.[monthKeyOf(at(i))] ?? landing.balance;
  const lowestFrom = (m: number) => {
    let low = { month: at(m), balance: b(m) - purchase.amount };
    for (let k = m + 1; k < m + WINDOW; k += 1) if (b(k) - purchase.amount < low.balance) low = { month: at(k), balance: b(k) - purchase.amount };
    return low;
  };

  const p = Math.min(SEARCH_MONTHS, Math.max(0, monthsAhead(now, purchase.date)));
  const lowest = lowestFrom(p);
  let earliest: Date | null = null;
  for (let m = 0; m <= SEARCH_MONTHS && !earliest; m += 1) if (lowestFrom(m).balance >= 0) earliest = at(m);

  const { resilience } = computeMetrics(projectPlan(plan, now, at(p), gov), p > 0 ? at(p) : now, gov);
  const avail = resilience.availableForRunway;
  const runwayBefore = resilience.essentialRunwayMonths;
  const runwayAfter = !Number.isFinite(runwayBefore) || avail <= 0 ? runwayBefore : (runwayBefore * Math.max(0, avail - purchase.amount)) / avail;

  return {
    account: landing.name,
    month: at(p),
    landingNow: b(0),
    landingBefore: b(p),
    landingAfter: b(p) - purchase.amount,
    lowest,
    room: Math.max(0, lowest.balance + purchase.amount),
    shortBy: Math.max(0, -lowest.balance),
    runwayBefore,
    runwayAfter,
    savings: avail,
    earliest,
  };
}

export interface FundingSource {
  accountId: string;
  name: string;
  kind: AccountKind;
  /** What the account gives in the purchase month: its balance by then with the deposits, less tax on the gain when an AF is sold. */
  available: number;
  /** AF: the tax on the gain taken off `available`. */
  tax: number;
}

/**
 * Savings accounts that could add to a down payment, as they should stand in the purchase month: spare cash
 * first, investments next, the emergency buffer last, the order they are drawn from.
 */
export function fundingSources(plan: FinancialPlan, date: Date, now: Date = new Date(), gov?: GovBondRate): FundingSource[] {
  const projected = projectPlan(plan, now, date, gov);
  const taxes = new Map(capitalTaxSummary(plan, now, gov).accounts.map((t) => [t.accountId, t.taxIfSold]));
  const order: AccountRole[] = ['cash_savings', 'investment', 'emergency'];
  return projected.accounts
    .filter((a) => isSavingsAccount(a) && a.balance > 0)
    .sort((a, b) => order.indexOf(accountRole(a.kind)) - order.indexOf(accountRole(b.kind)))
    .map((a) => {
      // Deposits raise the balance and the cost basis alike, so the gain, and its tax, stay as they are today.
      const tax = Math.min(a.balance, taxes.get(a.id) ?? 0);
      return { accountId: a.id, name: a.name, kind: a.kind, available: a.balance - tax, tax };
    });
}

/** What each chosen source puts in when `amount` is drawn from them in order. */
export function drawFrom<T extends { available: number }>(sources: T[], amount: number): { source: T; amount: number }[] {
  let left = Math.max(0, amount);
  return sources.flatMap((source) => {
    const take = Math.min(left, Math.max(0, source.available));
    left -= take;
    return take > 0 ? [{ source, amount: take }] : [];
  });
}

/** Paying `amount` back in `months` equal payments (annuity) at a yearly nominal rate, with any fees. */
export function installment(amount: number, months: number, aprPercent: number, setupFee = 0, monthlyFee = 0) {
  const n = Math.max(1, Math.round(months));
  const r = aprPercent / 1200;
  const monthly = (r ? (amount * r) / (1 - Math.pow(1 + r, -n)) : amount / n) + monthlyFee;
  const total = monthly * n + setupFee;
  return { monthly, total, extra: total - amount };
}

/** Car loans with the car as security (ägarförbehåll) need at least a fifth paid in cash (kontantinsats). */
export const CAR_MIN_DOWN_SHARE = 0.2;

/** The down payment the landing account can spare, kept between the loan's minimum and the price, in whole hundreds. */
export function suggestedDownPayment(room: number, price: number, minShare = 0): number {
  return Math.min(price, Math.max(Math.ceil(price * minShare), Math.floor(room / 100) * 100));
}

/**
 * The highest price where the landing account's spare `cash` covers the down payment (at least `minShare`)
 * plus any `upfront` costs, and the loan for the rest costs at most `budget` a month. `loanMonthly` prices a
 * loan (annuity, straight amortisation…); both it and `upfront` grow with the price, so the answer is found
 * by halving. 0 when nothing is left a month.
 */
export function maxAffordablePrice({
  cash,
  budget,
  minShare,
  loanMonthly,
  upfront = () => 0,
}: {
  cash: number;
  budget: number;
  minShare: number;
  loanMonthly: (loan: number, price: number) => number;
  upfront?: (price: number, loan: number) => number;
}): number {
  if (budget < 0) return 0;
  const spare = Math.max(0, cash);
  const fits = (price: number) => {
    const forDown = spare - upfront(price, Math.max(0, price - spare));
    const down = Math.min(price, forDown);
    return down >= price * minShare && loanMonthly(price - down, price) <= budget;
  };
  let lo = 0;
  let hi = minShare > 0 ? spare / minShare : spare + budget * 1200;
  if (fits(hi)) return Math.floor(hi);
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo);
}

/** A mortgage covers at most 90 % of the price from 1 April 2026 (lag 2026:226), so a tenth is paid in cash. */
export const HOME_MIN_DOWN_SHARE = 0.1;

/**
 * One-off costs of buying a house: stamp duty on the title (lagfart, 1.5 % + 825 kr) and new mortgage deeds
 * (pantbrev, 2 % + 375 kr) for what the loan needs beyond the deeds already taken out on the property. A
 * bostadsrätt is not real property and has neither.
 */
export function homeBuyingCosts(price: number, loan: number, house: boolean, existingDeeds = 0): number {
  if (!house || price <= 0) return 0;
  const newDeeds = Math.max(0, loan - Math.max(0, existingDeeds));
  return price * 0.015 + 825 + (newDeeds > 0 ? newDeeds * 0.02 + 375 : 0);
}

/** The 2026 ceiling on a house's property charge (kommunal fastighetsavgift); it follows inkomstbasbeloppet yearly. */
export const PROPERTY_FEE_CAP = 10_425;

/**
 * Yearly property charge on a house: 0.75 % of the assessed value (taxeringsvärde), taken as 75 % of the price,
 * capped. A bostadsrätt pays it through the association's fee.
 */
export function propertyFee(price: number): number {
  // ponytail: new builds are exempt for 15 years; a toggle if that comes up.
  return Math.min(PROPERTY_FEE_CAP, Math.max(0, price) * 0.75 * 0.0075);
}

/**
 * First-year monthly cost of a new mortgage: interest, less the tax reduction on it (ränteavdrag), plus the
 * amortisation the requirement sets from the loan-to-value (amorteringskrav). The cost falls as it is repaid.
 */
export function mortgageMonthly(loan: number, price: number, apr: number) {
  const ltv = price > 0 ? loan / price : 0;
  const percent = AMORTIZATION_TIERS.find((t) => ltv > t.aboveLtv)?.percent ?? 0;
  const amortization = (loan * percent) / 100 / 12;
  const interest = (loan * apr) / 100 / 12;
  const deduction = interestTaxReduction(interest * 12) / 12;
  return { interest, deduction, amortization, percent, monthly: interest - deduction + amortization };
}
