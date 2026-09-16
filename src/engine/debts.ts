import { addMonths, differenceInCalendarMonths, format, lastDayOfMonth } from 'date-fns';
import { toMonthly } from './frequency';
import type { Debt, DebtFrequency, DebtKind, ExpenseItem, FinancialPlan, MortgageRateType } from './types';

/*
 * Swedish loan rules. Every figure here is checked against the source named next to it; see
 * docs/swedish-loans.md for the reasoning and what to update each year.
 */

/** CSN raises an annuity loan's årsbelopp by about 2 % a year (uppräkning). */
export const CSN_STEP_UP = 0.02;
/** Studielån paid out 1989 to June 2001: 4 % of the income from two years earlier. */
export const CSN_INCOME_SHARE = 0.04;
/** Nedsättning on income for loans from July 2001: pay 5 % of income, 7 % from age 50. */
export const CSN_REDUCED_SHARE = 0.05;
export const CSN_REDUCED_SHARE_50_PLUS = 0.07;
/** Lowest årsbelopp CSN sets in 2026. */
export const CSN_MIN_YEARLY_2026 = 8880;
/** CSN bills quarterly by default, due the last banking day of February, May, August and November. */
export const CSN_DUE_MONTHS = [1, 4, 7, 10];

/** Skattereduktion för ränteutgifter: 30 % of interest up to 100 000 kr a year, 21 % above. Per person. */
export const INTEREST_DEDUCTION_RATE = 0.3;
export const INTEREST_DEDUCTION_REDUCED_RATE = 0.21;
export const INTEREST_DEDUCTION_LIMIT = 100_000;

/** Amorteringskrav (from 1 April 2026 without the extra 1 % for debt above 4.5× income). */
export const AMORTIZATION_TIERS = [
  { aboveLtv: 0.7, percent: 2 },
  { aboveLtv: 0.5, percent: 1 },
] as const;

const pos = (n: number | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);

const parseIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

/* ------------------------------------------------------------------ */
/* Security and ränteavdrag                                            */
/* ------------------------------------------------------------------ */

/** A mortgage is always secured by the home; CSN, personal loans and credit cards never are. */
export function isSecured(d: Pick<Debt, 'kind' | 'secured'>): boolean {
  switch (d.kind) {
    case 'mortgage':
      return true;
    case 'car':
    case 'other':
      return !!d.secured;
    default:
      return false;
  }
}

/**
 * Whether the interest gives ränteavdrag. From income year 2026 only loans with security qualify.
 * CSN interest never did.
 */
export function isDeductible(d: Pick<Debt, 'kind' | 'secured'>): boolean {
  return d.kind !== 'csn' && isSecured(d);
}

/** Yearly tax reduction on a year's deductible interest. */
export function interestTaxReduction(yearlyInterest: number): number {
  const i = pos(yearlyInterest);
  const low = Math.min(i, INTEREST_DEDUCTION_LIMIT);
  return low * INTEREST_DEDUCTION_RATE + (i - low) * INTEREST_DEDUCTION_REDUCED_RATE;
}

/** Interest rate after ränteavdrag, in percent. Uses the 30 % rate; the 21 % band only matters above 100 000 kr. */
export function effectiveRate(d: Pick<Debt, 'kind' | 'secured' | 'rate'>): number | undefined {
  if (d.rate === undefined || !Number.isFinite(d.rate) || d.rate < 0) return undefined;
  return isDeductible(d) ? d.rate * (1 - INTEREST_DEDUCTION_RATE) : d.rate;
}

/* ------------------------------------------------------------------ */
/* The monthly payment and where it goes                               */
/* ------------------------------------------------------------------ */

export interface DebtFlow {
  /** Monthly equivalent of what is paid. */
  monthly: number;
  /** Interest part, before ränteavdrag. Null when balance or rate is missing. */
  interest: number | null;
  /** Repayment part: what shrinks the debt. Null when it cannot be told apart from interest. */
  principal: number | null;
}

function monthlyRateOf(d: Debt): number | undefined {
  if (d.rate === undefined || !Number.isFinite(d.rate) || d.rate < 0) return undefined;
  return d.rate / 100 / 12;
}

function amortizationOf(d: Debt): number | undefined {
  return typeof d.amortization === 'number' && Number.isFinite(d.amortization) ? Math.max(0, d.amortization) : undefined;
}

/**
 * Splits a loan's monthly payment into interest and repayment.
 * - A Swedish mortgage is straight amortisation: a fixed amortering plus interest on what is left, so
 *   with balance, rate and amortering known the payment follows from them.
 * - Every other loan pays a set amount (an annuity, CSN's årsbelopp, a card's monthly payment);
 *   interest is the balance × monthly rate and the rest repays the debt.
 */
export function debtFlow(d: Debt): DebtFlow {
  const balance = pos(d.balance);
  const r = monthlyRateOf(d);
  const paid = toMonthly(pos(d.payment), d.frequency);

  if (d.kind === 'mortgage') {
    const amort = amortizationOf(d);
    if (balance > 0 && r !== undefined) {
      const interest = balance * r;
      if (amort !== undefined) {
        const principal = Math.min(amort, balance);
        return { monthly: interest + principal, interest, principal };
      }
      if (paid > 0) return { monthly: paid, interest: Math.min(interest, paid), principal: Math.max(0, paid - interest) };
      return { monthly: interest, interest, principal: 0 };
    }
    if (amort !== undefined) {
      const monthly = Math.max(paid, amort);
      return { monthly, interest: paid > 0 ? monthly - amort : null, principal: amort };
    }
    return { monthly: paid, interest: null, principal: null };
  }

  if (balance > 0 && r !== undefined && paid > 0) {
    const interest = Math.min(paid, balance * r);
    return { monthly: paid, interest, principal: Math.min(balance, paid - interest) };
  }
  return { monthly: paid, interest: null, principal: null };
}

/* ------------------------------------------------------------------ */
/* Payoff                                                              */
/* ------------------------------------------------------------------ */

export interface Payoff {
  /** Months until the balance reaches zero. Infinity when the payments never clear it. */
  months: number;
  /** Interest still to pay, before ränteavdrag. Null when the loan is never paid off. */
  totalInterest: number | null;
  /** Month of the last payment. */
  date: Date | null;
}

/** Yearly rate in percent for the month starting at `date`; undefined keeps the loan's own rate. */
export type RateAt = (date: Date) => number | undefined;

export interface ScheduleRow {
  date: Date;
  /** Yearly rate used that month, in percent. */
  rate: number;
  payment: number;
  interest: number;
  principal: number;
  /** Balance after the payment. */
  balance: number;
}

const MAX_MONTHS = 100 * 12;

/** Monthly rate for the month starting at `date`: from `rateAt` when it has one, otherwise the loan's own. */
function monthlyRateAt(own: number, date: Date, rateAt?: RateAt): number {
  const pct = rateAt?.(date);
  return pct === undefined || !Number.isFinite(pct) ? own : Math.max(0, pct) / 100 / 12;
}

/**
 * First month (next month is 1) the simulation takes a payment in. A quarterly or yearly payment is spread
 * over the months it covers, ending with the month it is due, so a due date more than one period away
 * means repayment has not started: the months before carry interest but no payment.
 */
function firstPaidMonth(d: Debt, now: Date): number {
  if (!d.nextDate || d.frequency === 'monthly') return 1;
  return differenceInCalendarMonths(parseIso(d.nextDate), now) - 12 / paymentsPerYear(d.frequency) + 1;
}

/** The first payment's due date when repayment has not started yet (the next payment is more than one period away). */
export function repaymentStart(d: Debt, now: Date): Date | null {
  return firstPaidMonth(d, now) > 1 ? parseIso(d.nextDate!) : null;
}

/**
 * Interest that builds up between now and the first payment, at today's rate or along `rateAt`. Null when
 * repayment has already started or balance or rate is missing.
 */
export function interestBeforeRepayment(d: Debt, now: Date, rateAt?: RateAt): { start: Date; interest: number } | null {
  const start = repaymentStart(d, now);
  const own = monthlyRateOf(d);
  let balance = pos(d.balance);
  if (!start || own === undefined || balance <= 0) return null;
  let interest = 0;
  for (let m = 1; m <= differenceInCalendarMonths(start, now); m += 1) {
    const due = balance * monthlyRateAt(own, addMonths(now, m), rateAt);
    interest += due;
    balance += due;
  }
  return { start, interest };
}

/**
 * Month-by-month run of a loan. CSN annuity payments step up by about 2 % a year the way CSN
 * recalculates them. With `rateAt` the rate can change over time; without it today's rate holds.
 * Before the first payment (see `firstPaidMonth`) interest is added to the balance.
 * Null when balance, rate or payment is missing.
 */
function simulate(
  d: Debt,
  now: Date,
  maxMonths: number,
  rateAt?: RateAt,
  onRow?: (row: ScheduleRow) => void,
): { months: number; interest: number; cleared: boolean } | null {
  let balance = pos(d.balance);
  const own = monthlyRateOf(d);
  if (balance <= 0 || own === undefined) return null;

  const amort = d.kind === 'mortgage' ? amortizationOf(d) : undefined;
  let payment = amort === undefined ? toMonthly(pos(d.payment), d.frequency) : 0;
  if (amort === undefined && payment <= 0) return null;
  const stepUp = d.kind === 'csn' && d.csnType !== 'income_based' ? CSN_STEP_UP : 0;
  const firstPaid = amort === undefined ? firstPaidMonth(d, now) : 1;

  let interest = 0;
  for (let m = 1; m <= maxMonths; m += 1) {
    const date = addMonths(now, m);
    const r = monthlyRateAt(own, date, rateAt);
    const due = balance * r;
    if (amort !== undefined) {
      // An interest-only mortgage never clears; a schedule still wants its rows.
      if (amort <= 0 && !onRow) break;
      const principal = Math.min(amort, balance);
      interest += due;
      balance -= principal;
      onRow?.({ date, rate: r * 1200, payment: due + principal, interest: due, principal, balance });
    } else if (m < firstPaid) {
      interest += due;
      balance += due;
      onRow?.({ date, rate: r * 1200, payment: 0, interest: due, principal: -due, balance });
    } else {
      // With a fixed rate a payment that does not cover the interest never will; a changing rate might.
      if (payment <= due && stepUp === 0 && !rateAt && !onRow) break;
      const paid = Math.min(payment, balance + due);
      interest += due;
      balance = balance + due - paid;
      onRow?.({ date, rate: r * 1200, payment: paid, interest: due, principal: paid - due, balance: Math.max(0, balance) });
      if ((m - firstPaid + 1) % 12 === 0) payment *= 1 + stepUp;
    }
    if (balance <= 0.5) return { months: m, interest, cleared: true };
  }
  return { months: maxMonths, interest, cleared: false };
}

/** When the loan is paid off and the interest on the way, at today's rate or along `rateAt`. */
export function debtPayoff(d: Debt, now: Date = new Date(), rateAt?: RateAt): Payoff | null {
  const run = simulate(d, now, MAX_MONTHS, rateAt);
  if (!run) return null;
  if (!run.cleared) return { months: Infinity, totalInterest: null, date: null };
  return { months: run.months, totalInterest: run.interest, date: addMonths(now, run.months) };
}

/**
 * Payment, interest and repayment for each of the next `months` months. A loan without balance or
 * rate pays its entered payment every month; a loan paid off pays nothing after that.
 */
export function debtSchedule(d: Debt, now: Date, months: number, rateAt?: RateAt): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  const run = simulate(d, now, months, rateAt, (row) => rows.push(row));
  if (!run) {
    const flow = debtFlow(d);
    for (let m = 1; m <= months; m += 1) {
      rows.push({
        date: addMonths(now, m),
        rate: d.rate ?? 0,
        payment: flow.monthly,
        interest: flow.interest ?? 0,
        principal: flow.principal ?? 0,
        balance: pos(d.balance),
      });
    }
    return rows;
  }
  for (let m = rows.length + 1; m <= months; m += 1) {
    rows.push({ date: addMonths(now, m), rate: 0, payment: 0, interest: 0, principal: 0, balance: 0 });
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Mortgage: amorteringskrav                                           */
/* ------------------------------------------------------------------ */

export interface AmortizationRequirement {
  /** Loan-to-value across all mortgages. */
  ltv: number;
  /** Required amortisation per year, in percent of the debt. */
  percent: number;
  /** Required amortisation per month, all mortgages together. */
  monthly: number;
  /** What the mortgages amortise per month today. */
  current: number;
  /** True when the current amortisation is below the requirement. */
  short: boolean;
}

/**
 * The requirement on the household's mortgages together, against the highest home value entered.
 * Banks apply it to the debt and value at purchase or the latest valuation; the current balance is
 * a close stand-in. Mortgages taken before June 2016 are exempt, which the plan cannot know.
 */
export function amortizationRequirement(debts: Debt[]): AmortizationRequirement | null {
  const mortgages = debts.filter((d) => d.kind === 'mortgage');
  const balance = mortgages.reduce((a, d) => a + pos(d.balance), 0);
  const value = Math.max(0, ...mortgages.map((d) => pos(d.propertyValue)));
  if (balance <= 0 || value <= 0) return null;
  const ltv = balance / value;
  const percent = AMORTIZATION_TIERS.find((t) => ltv > t.aboveLtv)?.percent ?? 0;
  const monthly = (balance * percent) / 100 / 12;
  const current = mortgages.reduce((a, d) => a + (debtFlow(d).principal ?? 0), 0);
  return { ltv, percent, monthly, current, short: current + 0.5 < monthly };
}

/* ------------------------------------------------------------------ */
/* CSN                                                                 */
/* ------------------------------------------------------------------ */

/** Årsbelopp of a 1989–2001 studielån: 4 % of the yearly income two years earlier. */
export function csnIncomeBasedYearly(yearlyIncome: number): number {
  return pos(yearlyIncome) * CSN_INCOME_SHARE;
}

/** Årsbelopp after nedsättning on income for a loan from July 2001. */
export function csnReducedYearly(yearlyIncome: number, age50plus = false): number {
  return pos(yearlyIncome) * (age50plus ? CSN_REDUCED_SHARE_50_PLUS : CSN_REDUCED_SHARE);
}

/** Next quarterly CSN due date (last day of February, May, August or November) on or after `now`. */
export function nextCsnDueDate(now: Date = new Date()): string {
  for (let i = 0; i < 12; i += 1) {
    const month = addMonths(new Date(now.getFullYear(), now.getMonth(), 1), i);
    if (!CSN_DUE_MONTHS.includes(month.getMonth())) continue;
    const due = lastDayOfMonth(month);
    if (due >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) return format(due, 'yyyy-MM-dd');
  }
  return format(lastDayOfMonth(now), 'yyyy-MM-dd');
}

/** Periods per year for a payment schedule. */
export function paymentsPerYear(f: DebtFrequency): number {
  return f === 'monthly' ? 12 : f === 'quarterly' ? 4 : 1;
}

/* ------------------------------------------------------------------ */
/* Which loan to pay off first                                         */
/* ------------------------------------------------------------------ */

/**
 * Rank when rates are missing or too close to call: unsecured and expensive first, the home last
 * among bank loans. CSN is not in this list; it always comes last (see `repaymentOrder`).
 */
const KIND_RANK: Record<Exclude<DebtKind, 'csn'>, { unsecured: number; secured: number }> = {
  credit_card: { unsecured: 0, secured: 0 },
  personal: { unsecured: 1, secured: 1 },
  other: { unsecured: 2, secured: 4 },
  car: { unsecured: 3, secured: 5 },
  mortgage: { unsecured: 6, secured: 6 },
};

/**
 * Typical 2026 rates used only to place a loan whose rate is not entered yet. Never shown.
 */
const TYPICAL_RATE: Record<Exclude<DebtKind, 'csn'>, { unsecured: number; secured: number }> = {
  credit_card: { unsecured: 18, secured: 18 },
  personal: { unsecured: 9, secured: 9 },
  other: { unsecured: 9, secured: 6 },
  car: { unsecured: 8, secured: 6 },
  mortgage: { unsecured: 3, secured: 3 },
};

/** A mortgage's rate type; mortgages saved before the choice existed are bunden when they have an end date. */
export function mortgageRateType(d: Pick<Debt, 'rateType' | 'rateFixedUntil'>): MortgageRateType {
  return d.rateType ?? (d.rateFixedUntil ? 'fixed' : 'variable');
}

export function kindRank(d: Pick<Debt, 'kind' | 'secured'>): number {
  if (d.kind === 'csn') return 99;
  return KIND_RANK[d.kind][isSecured(d) ? 'secured' : 'unsecured'];
}

/**
 * Order to put extra money towards loans: highest interest after ränteavdrag first, ties (within a
 * quarter of a percentage point) broken by security, rörliga mortgage parts before bundna. CSN always last: its rate is low, payments can
 * be lowered if income falls (nedsättning) and whatever is left is written off at death.
 */
export function repaymentOrder(debts: Debt[]): Debt[] {
  const open = debts.filter((d) => pos(d.balance) > 0 || toMonthly(pos(d.payment), d.frequency) > 0);
  const key = (d: Debt) => {
    if (d.kind === 'csn') return -Infinity;
    const known = effectiveRate(d);
    if (known !== undefined) return known;
    const typical = TYPICAL_RATE[d.kind][isSecured(d) ? 'secured' : 'unsecured'];
    return isDeductible(d) ? typical * (1 - INTEREST_DEDUCTION_RATE) : typical;
  };
  return [...open].sort((a, b) => {
    if ((a.kind === 'csn') !== (b.kind === 'csn')) return a.kind === 'csn' ? 1 : -1;
    // Between mortgage parts, extra money goes to the rörliga first: repaying a bunden del before its
    // villkorsändringsdag can cost ränteskillnadsersättning.
    if (a.kind === 'mortgage' && b.kind === 'mortgage' && mortgageRateType(a) !== mortgageRateType(b)) {
      return mortgageRateType(a) === 'variable' ? -1 : 1;
    }
    const diff = key(b) - key(a);
    if (Number.isFinite(diff) && Math.abs(diff) >= 0.25) return diff;
    return kindRank(a) - kindRank(b);
  });
}

/* ------------------------------------------------------------------ */
/* Plans saved before loans had their own model                        */
/* ------------------------------------------------------------------ */

const LEGACY_SLUGS: Record<string, DebtKind> = {
  student_loan: 'csn',
  mortgage: 'mortgage',
  mortgage_interest: 'mortgage',
  car_finance: 'car',
  personal_loan: 'personal',
  credit_card: 'credit_card',
  other_debt: 'other',
};

function legacyKind(e: ExpenseItem): DebtKind | null {
  if (e.includedElsewhere || e.frequency === 'once') return null;
  if (LEGACY_SLUGS[e.subcategory]) return LEGACY_SLUGS[e.subcategory];
  return e.tags.includes('debt') ? 'other' : null;
}

function asSchedule(e: ExpenseItem): { payment: number; frequency: DebtFrequency } {
  const amount = pos(e.amount);
  if (e.frequency === 'quarterly' || e.frequency === 'yearly' || e.frequency === 'monthly') {
    return { payment: amount, frequency: e.frequency };
  }
  return { payment: toMonthly(amount, e.frequency), frequency: 'monthly' };
}

/**
 * Moves loan repayments that were entered as expenses into `debts`, keeping the amount paid. A
 * "Mortgage payment" and "Mortgage interest" pair becomes one mortgage whose amortering is the first
 * and whose payment is both. Balance and rate stay empty for the user to fill in. Idempotent.
 */
export function migrateLegacyDebts(plan: FinancialPlan): FinancialPlan {
  // Mortgage payments first, so each can take a "Mortgage interest" line wherever it sits in the list.
  const legacy = plan.expenses
    .filter((e) => legacyKind(e) !== null)
    .sort((a, b) => Number(a.subcategory === 'mortgage_interest') - Number(b.subcategory === 'mortgage_interest'));
  if (legacy.length === 0 && Array.isArray(plan.debts)) return plan;

  const debts: Debt[] = [...(plan.debts ?? [])];
  const interestOnly = legacy.filter((e) => e.subcategory === 'mortgage_interest');
  const used = new Set<string>();

  for (const e of legacy) {
    if (used.has(e.id)) continue;
    const kind = legacyKind(e)!;
    const { payment, frequency } = asSchedule(e);
    const base: Debt = {
      id: `debt_${e.id}`,
      name: e.name,
      note: e.note,
      kind,
      balance: 0,
      payment,
      frequency,
      nextDate: frequency === 'monthly' ? undefined : e.nextDate,
    };
    used.add(e.id);

    if (kind === 'csn') {
      debts.push({ ...base, csnType: 'annuity' });
    } else if (kind === 'car') {
      debts.push({ ...base, secured: true });
    } else if (e.subcategory === 'mortgage') {
      const pair = interestOnly.find((x) => !used.has(x.id));
      const amortization = toMonthly(payment, frequency);
      if (pair) {
        used.add(pair.id);
        const interest = toMonthly(pos(pair.amount), pair.frequency);
        debts.push({ ...base, payment: amortization + interest, frequency: 'monthly', amortization, nextDate: undefined });
      } else {
        debts.push(base);
      }
    } else if (e.subcategory === 'mortgage_interest') {
      debts.push({ ...base, payment: toMonthly(payment, frequency), frequency: 'monthly', amortization: 0, nextDate: undefined });
    } else {
      debts.push(base);
    }
  }

  return { ...plan, expenses: plan.expenses.filter((e) => !used.has(e.id)), debts };
}
