import { getDaysInMonth } from 'date-fns';
import { amountSpread, monthlySpread } from './amounts';
import { isIrregular, monthsPerPeriod, toMonthly } from './frequency';
import { everydaySummaries, SPEND_GROUP_META, SPEND_GROUPS, spendEntryFor, spendGroupOf, type SpendSummary } from './everyday';
import { foodSummary, type FoodSummary } from './food';
import { debtFlow, debtPayoff, effectiveRate, interestTaxReduction, isDeductible, isSecured, loanAssets, paymentsPerYear, paysInMonth } from './debts';
import { lumpPayment, type LumpPayment } from './periods';
import { inPlanCurrency } from './fx';
import type { GovBondRate } from './rates';
import { savingsPots } from './savings';
import { capitalTaxSummary, type CapitalTaxSummary } from './tax/capital';
import { accountRole, debtName, expenseName, isEverydaySpend, type AccountRole } from './taxonomy';
import type { DebtKind, ExpenseCategory, ExpenseItem, ExpenseTag, FinancialPlan, SpendGroup } from './types';
import { EXPENSE_CATEGORIES } from './types';

/* ------------------------------------------------------------------ */
/* Output shape                                                        */
/* ------------------------------------------------------------------ */

export interface CostLine {
  id: string;
  name: string;
  category: ExpenseCategory;
  /** Typical monthly equivalent — the figure the plan budgets for. */
  monthly: number;
  annual: number;
  /** Monthly equivalents of the expected low and high. Equal to `monthly` for fixed items. */
  monthlyLow: number;
  monthlyHigh: number;
  /** True when the cost has a real spread between periods. */
  varies: boolean;
  essential: boolean;
  committed: boolean;
  fixed: boolean;
  /** Set for a quarterly or yearly bill: `monthly` is this month's share of it, held back until the due date. */
  lump?: LumpPayment;
}

/** Best and worst case of one figure, from the ranges on variable items. */
export interface Range {
  low: number;
  high: number;
}

/** A variable monthly item whose bill is paid in the viewed month. */
export interface PendingBill extends CostLine {
  /** YYYY-MM the bill covers; earlier than the paid month when the item bills in arrears. */
  periodMonth: string;
  billingLag: number;
}

/** A pending bill whose real amount has been entered. */
export interface ActualLine extends PendingBill {
  actual: number;
  /** actual − typical monthly. Positive means the bill ran above plan. */
  variance: number;
}

/**
 * Where the viewed month stands against the estimates. Variable items are guesses until the
 * bill arrives; once entered, the month runs on the real figure.
 */
export interface MonthActuals {
  /** YYYY-MM of the viewed month. */
  month: string;
  confirmed: ActualLine[];
  /** Variable monthly items still waiting for the bill paid this month. */
  pending: PendingBill[];
  /** Σ (actual − typical) over confirmed items, plus each everyday group's variance once its month is logged in full. */
  variance: number;
  /** Normal lifestyle cost with confirmed bills substituted for their estimates. */
  lifestyleCost: number;
  /** Same, but with pending items at their low / high bound. */
  lifestyleRange: Range;
  /** Planned cost per category with confirmed bills and fully logged everyday groups in place of their estimates. */
  byCategory: Record<ExpenseCategory, number>;
}

/** One loan, as the month sees it. */
export interface DebtLine {
  id: string;
  name: string;
  kind: DebtKind;
  balance: number;
  /** Monthly equivalent of the payment. */
  monthly: number;
  /** Interest and repayment parts; null while balance or rate is missing. */
  interest: number | null;
  principal: number | null;
  rate?: number;
  /** Rate after ränteavdrag (equal to `rate` when the loan gives none). */
  effectiveRate?: number;
  secured: boolean;
  deductible: boolean;
  /** Months to debt-free at today's rate and payment; Infinity when never, null when unknown. */
  payoffMonths: number | null;
  payoffDate: Date | null;
  /** Interest left to pay over the loan's life, before ränteavdrag. */
  interestLeft: number | null;
  /** Set for a loan paid quarterly or yearly: `monthly` is this month's share, held back until the due date. */
  lump?: LumpPayment;
}

export interface PlanMetrics {
  income: {
    reliable: number;
    variable: number;
    total: number;
    /** Sources marked "not in baseline", shown but excluded. */
    excluded: number;
  };
  expenses: {
    byCategory: Record<ExpenseCategory, number>;
    /** The part of each category's monthly figure that is set aside for a bill due in a later month. */
    byCategoryHeld: Record<ExpenseCategory, number>;
    total: number;
    essential: number;
    optional: number;
    fixed: number;
    variable: number;
    committed: number;
    flexible: number;
    lines: CostLine[];
  };
  /**
   * Spread of the normal month when every variable item runs at its low or its high.
   * `hasRanges` is false when nothing in the plan has a range, in which case low = high.
   */
  range: {
    hasRanges: boolean;
    lifestyleCost: Range;
    essentialCost: Range;
    byCategory: Record<ExpenseCategory, Range>;
    /** Income − savings − lifestyle at its high (low) / low (high). */
    breathingRoom: Range;
    /** Breathing room range minus one-offs this month, with confirmed bills fixed at their actual. */
    safeToSpend: Range;
    /** lifestyleCost.high − lifestyleCost.low: how much a normal month can swing. */
    swing: number;
  };
  /** Confirmed and pending bills for the viewed month. */
  actuals: MonthActuals;
  savings: {
    futureSpending: number;
    longTerm: number;
    total: number;
    /** Share of total income. */
    rate: number;
    /** Share of reliable income (PRD §18.7). */
    rateOfReliable: number;
  };
  /**
   * Loans. Payments are part of the month's cost (essential and committed), but only the interest is
   * a real cost: the repayment part lowers the debt and counts as building wealth.
   */
  debt: {
    lines: DebtLine[];
    /** Sum of monthly payments. */
    monthly: number;
    /** The part of `monthly` set aside for a quarterly or yearly payment due in a later month. */
    held: number;
    /** Known interest per month, before ränteavdrag. */
    interest: number;
    /** Ränteavdrag per month on deductible interest (comes back through tax). */
    taxReduction: number;
    /** Known repayment per month. */
    principal: number;
    /** Payments whose interest/repayment split is unknown. */
    unsplit: number;
    /** Total owed. */
    balance: number;
    /** Monthly payments as a share of total income. */
    shareOfIncome: number;
    /** CSN payments per month, which nedsättning can lower if income falls. */
    csnMonthly: number;
  };
  /** Spending only: active expenses without loan payments. */
  spendingCost: number;
  /** PRD §15. Includes loan payments: minimum debt repayments are essential. */
  essentialCost: number;
  /** Spending plus loan payments: what a normal month costs. */
  lifestyleCost: number;
  plannedCost: number;
  /** PRD §18.24 / §18.12 — income minus lifestyle minus savings. */
  breathingRoom: number;
  /**
   * PRD §18.1 — breathing room minus one-off costs dated in the current month, adjusted by
   * how far confirmed bills landed from their estimates.
   */
  safeToSpend: number;
  oneOffsThisMonth: number;
  /** PRD §18.27 */
  allocation: {
    lifestyle: number;
    futureSpending: number;
    longTerm: number;
    /** Repayment part of loan payments. */
    debtPaydown: number;
    unallocated: number;
  };
  /** PRD §13 / §19 */
  position: {
    everyday: number;
    cashSavings: number;
    emergency: number;
    investments: number;
    other: number;
    cashInBank: number;
    /** Everything in accounts. */
    totalAssets: number;
    byRole: Record<AccountRole, number>;
    /** Home value entered on the mortgage. */
    home: number;
    /** What cars and other property bought with a loan are worth. */
    otherProperty: number;
    /** Lent to people and not yet back, from the bank lines. Owned, since it is owed. */
    lentOut: number;
    /** totalAssets + home + otherProperty + lentOut. */
    totalOwned: number;
    /** Sum of loan balances. */
    totalDebt: number;
    /** The CSN part of `totalDebt`. */
    csnDebt: number;
    /** totalOwned − totalDebt. */
    netWorth: number;
    /**
     * Net worth with CSN left out. CSN is cheap, repaid over up to 25 years, lowered when income drops and
     * written off at death, so it weighs less than its balance suggests.
     */
    netWorthExcludingCsn: number;
    /** Net worth if everything were sold today: minus AF gains tax and this year's ISK/KF and fund tax still to pay. */
    netWorthAfterTax: number;
  };
  /** Tax on savings accounts this year: ISK/KF schablonskatt, AF, and interest on cash. See tax/capital.ts. */
  capitalTax: CapitalTaxSummary;
  /** PRD §18.25 / §18.26 / §18.14 */
  resilience: {
    emergencyMonths: number;
    essentialRunwayMonths: number;
    lifestyleRunwayMonths: number;
    availableForRunway: number;
    reliableCoversEssentials: boolean;
    reliableCoversLifestyle: boolean;
    /** reliable income − essential cost; negative means variable income is needed for essentials. */
    essentialMargin: number;
    /** Essential runway with CSN payments lowered to nothing, as nedsättning allows when income stops. */
    essentialRunwayCsnReducedMonths: number;
  };
  /** PRD §18.3 / §18.23 */
  topCosts: CostLine[];
  /** PRD §18.22 */
  subscriptions: { monthly: number; annual: number; lines: CostLine[] };
  /** PRD §18.21 */
  /** Car costs: tagged expenses plus car loan payments (`loans`). */
  car: { monthly: number; annual: number; lines: CostLine[]; loans: DebtLine[] };
  /** Food, getting around, and fun and leisure: per month, week and day, and the month's logged spending. */
  everyday: Record<SpendGroup, SpendSummary>;
  /** `everyday.food` with the split between food at home and eating out. */
  food: FoodSummary;
  /** PRD §18.15 — optional and flexible, largest first. */
  reducible: CostLine[];
  /** PRD §18.18 */
  daily: {
    flexibleBudget: number;
    perDay: number;
    perWeek: number;
    daysInMonth: number;
    daysRemaining: number;
    remaining: number;
  };
  /** True when the plan has enough data to say anything useful. */
  hasIncome: boolean;
  hasExpenses: boolean;
  hasAccounts: boolean;
  hasGoals: boolean;
  hasDebts: boolean;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function monthlyOf(item: { amount: number; frequency: ExpenseItem['frequency'] }): number {
  return toMonthly(item.amount, item.frequency);
}

/** Typical amount per period: `amount`, or the midpoint of the range when only a range was given. */
export function typicalAmount(e: ExpenseItem): number {
  return amountSpread(e).typical;
}

export function activeExpenses(plan: FinancialPlan): ExpenseItem[] {
  return plan.expenses.filter((e) => !e.includedElsewhere && typicalAmount(e) > 0);
}

export function toCostLine(e: ExpenseItem): CostLine {
  const s = monthlySpread(e);
  return {
    id: e.id,
    name: expenseName(e),
    category: e.category,
    monthly: s.typical,
    annual: s.typical * 12,
    monthlyLow: s.low,
    monthlyHigh: s.high,
    varies: s.high > s.low,
    essential: e.essential,
    committed: e.committed,
    fixed: e.fixed,
  };
}

/** YYYY-MM key used for `ExpenseItem.actuals`. */
export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** The entered bill for an item in a month, if any. */
export function actualFor(e: ExpenseItem, month: string): number | undefined {
  const v = e.actuals?.[month];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
}

/**
 * Whether an item is the kind whose bill we ask the user to confirm each month. Everyday spending has
 * no invoice: it is logged as one monthly total per group instead (`FinancialPlan.everydaySpend`).
 */
export function awaitsActual(e: ExpenseItem): boolean {
  return !e.fixed && e.frequency === 'monthly' && !e.includedElsewhere && !isEverydaySpend(e) && typicalAmount(e) > 0;
}

export function billingLagOf(e: { billingLag?: number; fixed?: boolean }): number {
  if (e.fixed) return 0;
  const n = e.billingLag ?? 0;
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Month (YYYY-MM) that a bill paid in `paidMonth` covers, given the item's billing lag. */
export function billPeriodFor(e: { billingLag?: number; fixed?: boolean }, paidMonth: string): string {
  const lag = billingLagOf(e);
  const [y, m] = paidMonth.split('-').map(Number);
  const d = new Date(y, (m ?? 1) - 1 - lag, 1);
  return monthKeyOf(d);
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

function safeDiv(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return a > 0 ? Infinity : 0;
  return a / b;
}

function hasTag(e: ExpenseItem, tag: ExpenseTag): boolean {
  return e.tags.includes(tag);
}

function isDatedInMonth(iso: string | undefined, now: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

/** `gov`: the live statslåneränta, which only matters for a year whose 30 November rate is not in the tables yet. */
export function computeMetrics(source: FinancialPlan, now: Date = new Date(), gov?: GovBondRate): PlanMetrics {
  const plan = inPlanCurrency(source, monthKeyOf(now));
  /* Income */
  const baseline = plan.income.filter((i) => i.includeInBaseline && i.amount > 0);
  const reliable = sum(baseline.filter((i) => i.reliability === 'reliable').map(monthlyOf));
  const variable = sum(baseline.filter((i) => i.reliability === 'variable').map(monthlyOf));
  const excluded = sum(plan.income.filter((i) => !i.includeInBaseline).map(monthlyOf));
  const totalIncome = reliable + variable;

  /* Expenses */
  // A one-off already paid in an earlier month is history, not a cost to keep spreading.
  const active = activeExpenses(plan).filter((e) => e.frequency !== 'once' || !e.nextDate || e.nextDate >= `${monthKeyOf(now)}-01`);
  const lines: CostLine[] = active.map((e) => {
    const line = toCostLine(e);
    const step = monthsPerPeriod(e.frequency);
    const lump =
      isIrregular(e.frequency, e.occurrences) && step ? lumpPayment(amountSpread(e).typical, step, e.nextDate, now) : null;
    return lump ? { ...line, lump } : line;
  });
  // A figure typed for a whole group replaces what its items add up to in every total; the items stay as the expected split.
  const groupOf = new Map(active.map((e) => [e.id, spendGroupOf(e)]));
  const budgetLines: CostLine[] = SPEND_GROUPS.flatMap((g) => {
    const budget = plan.everydayBudget?.[g];
    if (!budget) return [];
    const ls = lines.filter((l) => groupOf.get(l.id) === g);
    const low = sum(ls.map((l) => l.monthlyLow));
    const monthly = budget - sum(ls.map((l) => l.monthly));
    const monthlyLow = Math.min(low, budget) - low;
    const monthlyHigh = budget - sum(ls.map((l) => l.monthlyHigh));
    const meta = SPEND_GROUP_META[g];
    return [{ id: `budget:${g}`, name: meta.label, category: meta.category, monthly, annual: monthly * 12, monthlyLow, monthlyHigh, varies: monthlyLow !== monthlyHigh, essential: false, committed: false, fixed: false }];
  });
  const costed = [...lines, ...budgetLines];
  const emptyByCategory = () => Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, 0])) as Record<ExpenseCategory, number>;
  const byCategory = emptyByCategory();
  const byCategoryHeld = emptyByCategory();
  for (const l of costed) {
    byCategory[l.category] += l.monthly;
    if (l.lump && !l.lump.paidThisMonth) byCategoryHeld[l.category] += l.monthly;
  }

  const expenseTotal = sum(costed.map((l) => l.monthly));
  const essentialSpend = sum(lines.filter((l) => l.essential).map((l) => l.monthly));
  const fixed = sum(lines.filter((l) => l.fixed).map((l) => l.monthly));
  const committed = sum(lines.filter((l) => l.committed).map((l) => l.monthly));

  /* Loans */
  const debtLines: DebtLine[] = (plan.debts ?? [])
    .map((d) => {
      // Before the first payment period nothing is paid: the interest is added to the debt instead.
      const paying = paysInMonth(d, now);
      const flow = paying ? debtFlow(d) : { monthly: 0, interest: 0, principal: 0 };
      const lump = paying ? lumpPayment(Math.max(0, d.payment || 0), 12 / paymentsPerYear(d.frequency), d.nextDate, now) : null;
      const payoff = debtPayoff(d, now);
      return {
        id: d.id,
        name: debtName(d),
        kind: d.kind,
        balance: Math.max(0, d.balance || 0),
        monthly: flow.monthly,
        interest: flow.interest,
        principal: flow.principal,
        rate: d.rate,
        effectiveRate: effectiveRate(d),
        secured: isSecured(d),
        deductible: isDeductible(d),
        payoffMonths: payoff?.months ?? null,
        payoffDate: payoff?.date ?? null,
        interestLeft: payoff?.totalInterest ?? null,
        ...(lump ? { lump } : {}),
      };
    })
    .filter((l) => l.monthly > 0 || l.balance > 0);
  const debtMonthly = sum(debtLines.map((l) => l.monthly));
  const debtHeld = sum(debtLines.filter((l) => l.lump && !l.lump.paidThisMonth).map((l) => l.monthly));
  const debtInterest = sum(debtLines.map((l) => l.interest ?? 0));
  const debtPrincipal = sum(debtLines.map((l) => l.principal ?? 0));
  const deductibleInterest = sum(debtLines.filter((l) => l.deductible).map((l) => l.interest ?? 0));
  const taxReduction = interestTaxReduction(deductibleInterest * 12) / 12;
  const csnMonthly = sum(debtLines.filter((l) => l.kind === 'csn').map((l) => l.monthly));
  const totalDebt = sum(debtLines.map((l) => l.balance));
  const csnDebt = sum(debtLines.filter((l) => l.kind === 'csn').map((l) => l.balance));
  const essential = essentialSpend + debtMonthly;

  /* Ranges — best and worst normal month */
  const rangeOf = (ls: CostLine[]): Range => ({
    low: sum(ls.map((l) => l.monthlyLow)),
    high: sum(ls.map((l) => l.monthlyHigh)),
  });
  const withDebt = (r: Range): Range => ({ low: r.low + debtMonthly, high: r.high + debtMonthly });
  const lifestyleRange = withDebt(rangeOf(costed));
  const essentialRange = withDebt(rangeOf(lines.filter((l) => l.essential)));
  const byCategoryRange = Object.fromEntries(
    EXPENSE_CATEGORIES.map((c) => [c, rangeOf(costed.filter((l) => l.category === c))]),
  ) as Record<ExpenseCategory, Range>;
  const hasRanges = lines.some((l) => l.varies);

  /* Actuals — bills confirmed for the viewed month */
  const month = monthKeyOf(now);
  const everyday = everydaySummaries(active, plan.everydaySpend, month, plan.everydayBudget);
  const food = foodSummary(everyday.food, active);
  // A group's total for the whole month replaces the estimates of every item in it at once.
  const byId = new Map(lines.map((l) => [l.id, l]));
  // Bills the bank has seen before: a payee learnt, or lines sorted into them. With the bank on, one of those that
  // may be nothing at all (a range from 0) counts as nothing this month until a line shows, like everyday spending.
  const bankOn = !!plan.bank?.sessions.length;
  const bankSeen = new Set(Object.values(plan.bank?.lines ?? {}).map((c) => ('expenseId' in c ? c.expenseId : '')));
  const zeroUntilSeen = (e: ExpenseItem, l: CostLine) => bankOn && l.varies && l.monthlyLow === 0 && (!!e.bankMatch || bankSeen.has(e.id));
  const loggedIds = new Set<string>();
  let everydayVariance = 0;
  // While the bank feeds a running month, an item that may be nothing at all (a range from 0) counts only once the
  // group's spending passes what the rest of the group was planned for: fuel for a borrowed car is 0 until a fill-up shows.
  const everydayNow: Partial<Record<SpendGroup, number>> = {};
  for (const g of SPEND_GROUPS) {
    const g_ = everyday[g];
    if (g_.month.complete) {
      for (const id of g_.itemIds) loggedIds.add(id);
      everydayVariance += g_.month.variance ?? 0;
    } else if (g_.month.spent !== undefined && spendEntryFor(plan.everydaySpend?.[g], month)?.source === 'bank') {
      const maybe = sum(g_.itemIds.map((id) => byId.get(id)).map((l) => (l?.varies && l.monthlyLow === 0 ? l.monthly : 0)));
      // A group planned at nothing (other) is over plan from its first line.
      if (maybe > 0 || g_.month.planned === 0) everydayVariance += everydayNow[g] = Math.max(0, g_.month.spent - (g_.month.planned - maybe)) - maybe;
    }
  }
  const confirmed: ActualLine[] = [];
  const pending: PendingBill[] = [];
  const nothingYet: CostLine[] = [];
  for (const e of active) {
    const line = byId.get(e.id);
    if (!line) continue;
    // A one-off counts whole in its month (see oneOffsThisMonth); its bank line must not count again as a variance.
    if (loggedIds.has(e.id) || e.frequency === 'once') continue;
    const actual = actualFor(e, month);
    const bill: PendingBill = { ...line, periodMonth: billPeriodFor(e, month), billingLag: billingLagOf(e) };
    if (actual !== undefined) {
      confirmed.push({ ...bill, actual, variance: actual - line.monthly });
    } else if (awaitsActual(e)) {
      pending.push(bill);
      if (zeroUntilSeen(e, line)) nothingYet.push(line);
    }
  }
  const confirmedIds = new Set([...confirmed.map((l) => l.id), ...loggedIds]);
  const actualVariance = sum(confirmed.map((l) => l.variance)) + everydayVariance - sum(nothingYet.map((l) => l.monthly));
  const actualByCategory = { ...byCategory };
  for (const l of confirmed) actualByCategory[l.category] += l.variance;
  for (const l of nothingYet) actualByCategory[l.category] -= l.monthly;
  for (const e of active) {
    if (e.frequency === 'once' && isDatedInMonth(e.nextDate, now)) actualByCategory[e.category] += typicalAmount(e) - (byId.get(e.id)?.monthly ?? 0);
  }
  for (const g of SPEND_GROUPS) {
    actualByCategory[SPEND_GROUP_META[g].category] += everyday[g].month.complete ? (everyday[g].month.variance ?? 0) : (everydayNow[g] ?? 0);
  }
  const monthLifestyle = expenseTotal + debtMonthly + actualVariance;
  const monthLifestyleRange: Range = withDebt({
    low: sum(costed.map((l) => (confirmedIds.has(l.id) ? l.monthly : l.monthlyLow))) + actualVariance,
    high: sum(costed.map((l) => (confirmedIds.has(l.id) ? l.monthly : l.monthlyHigh))) + actualVariance,
  });

  /* Savings */
  const goals = savingsPots(plan).filter((g) => g.monthlyContribution > 0);
  const futureSpending = sum(
    goals.filter((g) => g.purpose === 'future_spending').map((g) => g.monthlyContribution),
  );
  const longTerm = sum(goals.filter((g) => g.purpose === 'long_term').map((g) => g.monthlyContribution));
  const savingsTotal = futureSpending + longTerm;

  /* Core numbers */
  const lifestyleCost = expenseTotal + debtMonthly;
  const plannedCost = lifestyleCost + savingsTotal;
  const breathingRoom = totalIncome - plannedCost;
  const oneOffsThisMonth = sum(
    active.filter((e) => e.frequency === 'once' && isDatedInMonth(e.nextDate, now)).map(typicalAmount),
  );
  const safeToSpend = breathingRoom - oneOffsThisMonth - actualVariance;
  const breathingRoomRange: Range = {
    low: totalIncome - savingsTotal - lifestyleRange.high,
    high: totalIncome - savingsTotal - lifestyleRange.low,
  };
  const safeToSpendRange: Range = {
    low: totalIncome - savingsTotal - monthLifestyleRange.high - oneOffsThisMonth,
    high: totalIncome - savingsTotal - monthLifestyleRange.low - oneOffsThisMonth,
  };

  /* Position */
  const byRole: Record<AccountRole, number> = {
    everyday: 0,
    cash_savings: 0,
    emergency: 0,
    investment: 0,
    other: 0,
  };
  for (const a of plan.accounts) byRole[accountRole(a.kind)] += a.balance;
  const cashInBank = byRole.everyday + byRole.cash_savings;
  const totalAssets = sum(Object.values(byRole));
  const property = loanAssets(plan.debts ?? []);
  const lentOut = plan.bank?.lentOut ?? 0;
  const totalOwned = totalAssets + property.home + property.other + lentOut;
  const netWorth = totalOwned - totalDebt;
  const capitalTax = capitalTaxSummary(plan, now, gov);
  // Tax already taken (KF by the insurer, interest by the bank) is out of the balances; the rest is still owed.
  const taxStillOwed = sum(capitalTax.accounts.map((t) => Math.max(0, t.tax - t.withheld)));
  const netWorthAfterTax = netWorth - capitalTax.taxIfSold - taxStillOwed;

  /* Resilience */
  const availableForRunway = cashInBank + byRole.emergency;
  const essentialMargin = reliable - essential;
  const essentialWithoutCsn = essential - csnMonthly;

  /* Analyses */
  const sortedLines = [...lines].sort((a, b) => b.monthly - a.monthly);
  const subLines = active.filter((e) => hasTag(e, 'subscription')).map(toCostLine);
  const carLines = active.filter((e) => hasTag(e, 'car')).map(toCostLine);
  const carLoans = debtLines.filter((l) => l.kind === 'car');
  const reducible = sortedLines.filter((l) => !l.essential && !l.committed);

  /* Daily */
  const daysInMonth = getDaysInMonth(now);
  const daysRemaining = Math.max(1, daysInMonth - now.getDate() + 1);
  const flexibleSpend = expenseTotal - committed;
  const flexibleBudget = Math.max(0, flexibleSpend + safeToSpend);
  const remaining = flexibleBudget * (daysRemaining / daysInMonth);
  const perDay = flexibleBudget / daysInMonth;

  return {
    income: { reliable, variable, total: totalIncome, excluded },
    expenses: {
      byCategory,
      byCategoryHeld,
      total: expenseTotal,
      essential: essentialSpend,
      optional: expenseTotal - essentialSpend,
      fixed,
      variable: expenseTotal - fixed,
      committed,
      flexible: flexibleSpend,
      lines,
    },
    range: {
      hasRanges,
      lifestyleCost: lifestyleRange,
      essentialCost: essentialRange,
      byCategory: byCategoryRange,
      breathingRoom: breathingRoomRange,
      safeToSpend: safeToSpendRange,
      swing: lifestyleRange.high - lifestyleRange.low,
    },
    actuals: {
      month,
      confirmed,
      pending,
      variance: actualVariance,
      lifestyleCost: monthLifestyle,
      lifestyleRange: monthLifestyleRange,
      byCategory: actualByCategory,
    },
    savings: {
      futureSpending,
      longTerm,
      total: savingsTotal,
      rate: totalIncome > 0 ? savingsTotal / totalIncome : 0,
      rateOfReliable: reliable > 0 ? savingsTotal / reliable : 0,
    },
    debt: {
      lines: debtLines,
      monthly: debtMonthly,
      held: debtHeld,
      interest: debtInterest,
      taxReduction,
      principal: debtPrincipal,
      unsplit: sum(debtLines.filter((l) => l.principal === null).map((l) => l.monthly)),
      balance: totalDebt,
      shareOfIncome: totalIncome > 0 ? debtMonthly / totalIncome : 0,
      csnMonthly,
    },
    spendingCost: expenseTotal,
    essentialCost: essential,
    lifestyleCost,
    plannedCost,
    breathingRoom,
    safeToSpend,
    oneOffsThisMonth,
    allocation: {
      lifestyle: totalIncome > 0 ? (lifestyleCost - debtPrincipal) / totalIncome : 0,
      futureSpending: totalIncome > 0 ? futureSpending / totalIncome : 0,
      longTerm: totalIncome > 0 ? longTerm / totalIncome : 0,
      debtPaydown: totalIncome > 0 ? debtPrincipal / totalIncome : 0,
      unallocated: totalIncome > 0 ? Math.max(0, breathingRoom) / totalIncome : 0,
    },
    position: {
      everyday: byRole.everyday,
      cashSavings: byRole.cash_savings,
      emergency: byRole.emergency,
      investments: byRole.investment,
      other: byRole.other,
      cashInBank,
      totalAssets,
      byRole,
      home: property.home,
      otherProperty: property.other,
      lentOut,
      totalOwned,
      totalDebt,
      csnDebt,
      netWorth,
      netWorthExcludingCsn: netWorth + csnDebt,
      netWorthAfterTax,
    },
    capitalTax,
    resilience: {
      emergencyMonths: safeDiv(byRole.emergency, essential),
      essentialRunwayMonths: safeDiv(availableForRunway, essential),
      lifestyleRunwayMonths: safeDiv(availableForRunway, lifestyleCost),
      availableForRunway,
      reliableCoversEssentials: reliable >= essential,
      reliableCoversLifestyle: reliable >= lifestyleCost,
      essentialMargin,
      essentialRunwayCsnReducedMonths: safeDiv(availableForRunway, essentialWithoutCsn),
    },
    topCosts: sortedLines.slice(0, 8),
    subscriptions: {
      monthly: sum(subLines.map((l) => l.monthly)),
      annual: sum(subLines.map((l) => l.annual)),
      lines: subLines.sort((a, b) => b.monthly - a.monthly),
    },
    car: {
      monthly: sum(carLines.map((l) => l.monthly)) + sum(carLoans.map((l) => l.monthly)),
      annual: sum(carLines.map((l) => l.annual)) + sum(carLoans.map((l) => l.monthly * 12)),
      lines: carLines.sort((a, b) => b.monthly - a.monthly),
      loans: carLoans,
    },
    everyday,
    food,
    reducible,
    daily: {
      flexibleBudget,
      perDay,
      perWeek: perDay * 7,
      daysInMonth,
      daysRemaining,
      remaining,
    },
    hasIncome: totalIncome > 0,
    hasExpenses: expenseTotal > 0,
    hasAccounts: plan.accounts.length > 0,
    hasGoals: plan.goals.length > 0,
    hasDebts: debtLines.length > 0,
  };
}
