import type { GovBondRate } from '../rates';
import type { Account, AccountKind, FinancialPlan } from '../types';

/*
 * Tax on savings: ISK and KF (schablonskatt), AF (tax on gains, dividends and funds) and interest on cash
 * accounts. One person: the tax-free level is shared by every ISK and KF in the plan.
 * Rules and sources: docs/swedish-savings.md. Update the constants marked *yearly* each December.
 */

/** Tax on capital income. */
export const CAPITAL_TAX_RATE = 0.3;
/** The schablonränta is the statslåneränta on 30 November the year before plus one point, at least 1.25 %. */
export const SCHABLON_MARGIN = 1;
export const SCHABLON_FLOOR = 1.25;
/** AF: funds held on 1 January count 0.4 % of their value as income (0.12 % tax). */
export const FUND_SCHABLON = 0.004;
/** A loss left over after offsetting gains on listed shares and funds counts at 70 % against other capital income. */
export const LOSS_DEDUCTION_SHARE = 0.7;
/** KF: premiums paid from 1 July count at half. */
export const KF_SECOND_HALF_SHARE = 0.5;
/** Insättningsgaranti per person and bank (*yearly*: Riksgälden recalculates it every five years; 1 150 000 kr from 2026). */
export const DEPOSIT_GUARANTEE = 1_150_000;
/** Suggested expected return for a new ISK, KF or AF. */
export const SUGGESTED_RETURN = 6;

/**
 * *yearly*: `slr` is the statslåneränta on 30 November the year before (Riksgälden); `taxFree` the kapitalunderlag
 * across ISK and KF that is not taxed (skattefri grundnivå, from 2025).
 */
export const CAPITAL_TAX_YEARS: Record<number, { slr: number; taxFree: number }> = {
  2024: { slr: 2.62, taxFree: 0 },
  2025: { slr: 1.96, taxFree: 150_000 },
  2026: { slr: 2.55, taxFree: 300_000 },
};

export type SavingsWrapper = 'isk' | 'kf' | 'af' | 'cash' | 'unknown';

export function wrapperOf(kind: AccountKind): SavingsWrapper {
  if (kind === 'isk' || kind === 'kf' || kind === 'af') return kind;
  return kind === 'investment' ? 'unknown' : 'cash';
}

export interface CapitalTaxYear {
  year: number;
  /** Statslåneränta on 30 November the year before, percent. */
  slr: number;
  /** max(1.25, slr + 1), percent. */
  schablonRate: number;
  taxFree: number;
  /** True while 30 November has not come yet: `slr` is today's rate, so the tax is an estimate. */
  preliminary: boolean;
}

export function resolveCapitalYear(year: number, gov?: GovBondRate): CapitalTaxYear {
  const years = Object.keys(CAPITAL_TAX_YEARS).map(Number).sort((a, b) => a - b);
  const levelYear = years.filter((y) => y <= year).pop();
  const taxFree = levelYear === undefined ? 0 : CAPITAL_TAX_YEARS[levelYear].taxFree;
  let slr = CAPITAL_TAX_YEARS[year]?.slr ?? gov?.nov30[String(year - 1)];
  const preliminary = slr === undefined;
  if (slr === undefined) slr = gov?.value ?? CAPITAL_TAX_YEARS[years[years.length - 1]].slr;
  return { year, slr, schablonRate: Math.max(SCHABLON_FLOOR, slr + SCHABLON_MARGIN), taxFree, preliminary };
}

/* ------------------------------------------------------------------ */
/* Balances through the year                                           */
/* ------------------------------------------------------------------ */

const monthIndex = (d: Date) => d.getFullYear() * 12 + d.getMonth();
const keyOf = (index: number) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;

/** Percent a year → rate a month, compounding to the same yearly figure. */
export function monthlyRate(percentPerYear: number): number {
  return percentPerYear > -100 ? Math.pow(1 + percentPerYear / 100, 1 / 12) - 1 : 0;
}

/** Yearly return before tax, percent: interest on cash accounts, expected return on the rest. */
export function grossReturnOf(a: Account): number {
  return (wrapperOf(a.kind) === 'cash' ? a.interestRate : a.expectedReturn) ?? 0;
}

/** Money put into the account each month: the linked goals' contributions, else the account's own figure. */
export function monthlyDepositOf(a: Account, plan: Pick<FinancialPlan, 'goals'>): number {
  const linked = plan.goals.filter((g) => g.linkedAccountId === a.id);
  if (linked.length > 0) return linked.reduce((s, g) => s + Math.max(0, g.monthlyContribution || 0), 0);
  return Math.max(0, a.monthlyDeposit ?? 0);
}

/**
 * Value at the start of `month0` (0 = January) of `year`. For a month already passed: the balance recorded for the
 * month before (or the closest one recorded earlier). Ahead: today's balance grown by the return and deposits.
 */
export function valueAtMonthStart(a: Account, year: number, month0: number, now: Date, deposit: number): number {
  const prev = year * 12 + month0 - 1;
  const today = monthIndex(now);
  if (prev < today) {
    const recorded = Object.entries(a.balances ?? {})
      .filter(([k, v]) => k <= keyOf(prev) && Number.isFinite(v))
      .sort(([x], [y]) => x.localeCompare(y))
      .pop();
    return recorded ? recorded[1] : a.balance;
  }
  const r = monthlyRate(grossReturnOf(a));
  let v = a.balance;
  for (let i = 0; i < prev - today; i += 1) v = v * (1 + r) + deposit;
  return v;
}

/** Values on 1 January, 1 April, 1 July and 1 October. */
export function quarterValues(a: Account, year: number, now: Date, deposit: number): [number, number, number, number] {
  const q = [0, 3, 6, 9].map((m) => Math.max(0, valueAtMonthStart(a, year, m, now, deposit)));
  return [q[0], q[1], q[2], q[3]];
}

/** ISK: (the four quarter values + deposits during the year) / 4. */
export function iskUnderlag(quarters: readonly number[], deposits: number): number {
  return (quarters.reduce((s, v) => s + v, 0) + deposits) / 4;
}

/** KF: value on 1 January + premiums, those paid from 1 July at half. */
export function kfUnderlag(january: number, firstHalf: number, secondHalf: number): number {
  return january + firstHalf + secondHalf * KF_SECOND_HALF_SHARE;
}

/* ------------------------------------------------------------------ */
/* The year's tax                                                      */
/* ------------------------------------------------------------------ */

export interface AccountTax {
  accountId: string;
  name: string;
  kind: AccountKind;
  wrapper: SavingsWrapper;
  /** ISK/KF: kapitalunderlag. AF: funds held on 1 January. Cash: average balance. */
  underlag: number;
  /** ISK/KF: tax before the tax-free level. Otherwise equal to `tax`. */
  taxBeforeFree: number;
  /** The year's tax after the tax-free level. */
  tax: number;
  /** Taken during the year: KF by the insurer (on the whole underlag), interest and dividends by the bank. */
  withheld: number;
  /** Settled in next spring's final tax: ISK, AF's fund tax, minus a KF refund. */
  slutskatt: number;
  /** AF: value minus cost basis; undefined without a cost basis. */
  gain?: number;
  /** AF: 30 % of a gain if everything were sold today. */
  taxIfSold: number;
  /** AF: expected yearly return after this tax, percent (gains are taxed only when sold). Others: after all tax. */
  netReturn: number;
}

export interface CapitalTaxSummary {
  year: CapitalTaxYear;
  accounts: AccountTax[];
  /** Σ tax over all accounts. */
  total: number;
  /** Kapitalunderlag across ISK and KF, and how much of the tax-free level it uses. */
  schablonUnderlag: number;
  taxFreeUsed: number;
  /** Room left under the tax-free level. */
  taxFreeLeft: number;
  /** Net effect on next spring's final tax: ISK + AF fund tax − KF refund. */
  slutskatt: number;
  /** KF tax taken above what is owed, returned through the tax return. */
  kfRefund: number;
  /** Σ AF tax if sold today. */
  taxIfSold: number;
  /** Balance in investment accounts with no wrapper chosen, left out of the tax. */
  unknownBalance: number;
}

/** Tax on every savings account for `year` (default: the year of `now`). */
export function capitalTaxSummary(
  plan: Pick<FinancialPlan, 'accounts' | 'goals'>,
  now: Date,
  gov?: GovBondRate,
  yearNumber: number = now.getFullYear(),
): CapitalTaxSummary {
  const year = resolveCapitalYear(yearNumber, gov);
  const rate = year.schablonRate / 100;

  const rows = plan.accounts.map((a) => {
    const wrapper = wrapperOf(a.kind);
    const deposit = monthlyDepositOf(a, plan);
    const q = quarterValues(a, yearNumber, now, deposit);
    const average = q.reduce((s, v) => s + v, 0) / 4;
    const gross = grossReturnOf(a);
    let underlag = 0;
    let taxBeforeFree = 0;
    let withheld = 0;
    let slutskatt = 0;
    let netReturn = gross;
    let gain: number | undefined;
    let taxIfSold = 0;
    if (wrapper === 'isk' || wrapper === 'kf') {
      underlag = wrapper === 'isk' ? iskUnderlag(q, deposit * 12) : kfUnderlag(q[0], deposit * 6, deposit * 6);
      taxBeforeFree = underlag * rate * CAPITAL_TAX_RATE;
    } else if (wrapper === 'af') {
      const funds = Math.min(100, Math.max(0, a.fundShare ?? 100)) / 100;
      underlag = q[0] * funds;
      const fundTax = underlag * FUND_SCHABLON * CAPITAL_TAX_RATE;
      const dividendTax = average * (1 - funds) * ((a.dividendYield ?? 0) / 100) * CAPITAL_TAX_RATE;
      taxBeforeFree = fundTax + dividendTax;
      withheld = dividendTax;
      slutskatt = fundTax;
      netReturn = gross - (funds * FUND_SCHABLON + (1 - funds) * ((a.dividendYield ?? 0) / 100)) * CAPITAL_TAX_RATE * 100;
      if (a.costBasis !== undefined && a.costBasis > 0) {
        gain = a.balance - a.costBasis;
        taxIfSold = Math.max(0, gain) * CAPITAL_TAX_RATE;
      }
    } else if (wrapper === 'cash') {
      underlag = average;
      taxBeforeFree = average * (Math.max(0, a.interestRate ?? 0) / 100) * CAPITAL_TAX_RATE;
      withheld = taxBeforeFree;
      netReturn = gross > 0 ? gross * (1 - CAPITAL_TAX_RATE) : gross;
    }
    return { a, wrapper, underlag, taxBeforeFree, withheld, slutskatt, netReturn, gain, taxIfSold, average };
  });

  const schablonUnderlag = rows
    .filter((r) => r.wrapper === 'isk' || r.wrapper === 'kf')
    .reduce((s, r) => s + r.underlag, 0);
  const taxableShare = schablonUnderlag > 0 ? Math.max(0, schablonUnderlag - year.taxFree) / schablonUnderlag : 0;
  const drag = year.schablonRate * CAPITAL_TAX_RATE * taxableShare;

  const accounts: AccountTax[] = rows.map((r) => {
    const base = {
      accountId: r.a.id,
      name: r.a.name,
      kind: r.a.kind,
      wrapper: r.wrapper,
      underlag: r.underlag,
      taxBeforeFree: r.taxBeforeFree,
      gain: r.gain,
      taxIfSold: r.taxIfSold,
    };
    if (r.wrapper === 'isk' || r.wrapper === 'kf') {
      const tax = r.taxBeforeFree * taxableShare;
      const netReturn = grossReturnOf(r.a) - drag;
      return r.wrapper === 'isk'
        ? { ...base, tax, withheld: 0, slutskatt: tax, netReturn }
        : { ...base, tax, withheld: r.taxBeforeFree, slutskatt: tax - r.taxBeforeFree, netReturn };
    }
    return { ...base, tax: r.taxBeforeFree, withheld: r.withheld, slutskatt: r.slutskatt, netReturn: r.netReturn };
  });

  const sum = (f: (t: AccountTax) => number) => accounts.reduce((s, t) => s + f(t), 0);
  return {
    year,
    accounts,
    total: sum((t) => t.tax),
    schablonUnderlag,
    taxFreeUsed: Math.min(schablonUnderlag, year.taxFree),
    taxFreeLeft: Math.max(0, year.taxFree - schablonUnderlag),
    slutskatt: sum((t) => t.slutskatt),
    kfRefund: sum((t) => (t.wrapper === 'kf' ? t.withheld - t.tax : 0)),
    taxIfSold: sum((t) => t.taxIfSold),
    unknownBalance: plan.accounts.filter((a) => wrapperOf(a.kind) === 'unknown').reduce((s, a) => s + a.balance, 0),
  };
}

/** AF loss if sold today: what it is worth against gains on listed shares and funds, and against other capital income. */
export function lossValue(loss: number): { againstGains: number; otherwise: number } {
  const l = Math.max(0, loss);
  return { againstGains: l * CAPITAL_TAX_RATE, otherwise: l * LOSS_DEDUCTION_SHARE * CAPITAL_TAX_RATE };
}

/* ------------------------------------------------------------------ */
/* Suggestions                                                         */
/* ------------------------------------------------------------------ */

export type SavingsNudge =
  /** Investment accounts saved without a wrapper: their tax is unknown. */
  | { kind: 'pick_wrapper'; accountIds: string[]; balance: number }
  /** Cash in savings accounts while the ISK/KF tax-free level has room. */
  | { kind: 'cash_to_isk'; cash: number; room: number; interestTax: number }
  /** An AF expected to return more than the schablonränta: an ISK would likely tax less. */
  | { kind: 'af_to_isk'; accountId: string; name: string; expectedReturn: number; breakEven: number; taxIfSold: number; gain?: number; room: number }
  /** More cash at one bank than the deposit guarantee covers. */
  | { kind: 'deposit_guarantee'; institution: string; amount: number };

const MIN_NUDGE = 10_000;

export function savingsNudges(plan: Pick<FinancialPlan, 'accounts'>, summary: CapitalTaxSummary): SavingsNudge[] {
  const out: SavingsNudge[] = [];
  const unknown = plan.accounts.filter((a) => wrapperOf(a.kind) === 'unknown');
  if (unknown.length > 0) {
    out.push({ kind: 'pick_wrapper', accountIds: unknown.map((a) => a.id), balance: summary.unknownBalance });
  }

  const savingsKinds: AccountKind[] = ['savings', 'cash'];
  const cashAccounts = plan.accounts.filter((a) => savingsKinds.includes(a.kind));
  const cash = cashAccounts.reduce((s, a) => s + Math.max(0, a.balance), 0);
  if (cash >= MIN_NUDGE && summary.taxFreeLeft >= MIN_NUDGE) {
    const interestTax = summary.accounts
      .filter((t) => cashAccounts.some((a) => a.id === t.accountId))
      .reduce((s, t) => s + t.tax, 0);
    out.push({ kind: 'cash_to_isk', cash, room: summary.taxFreeLeft, interestTax });
  }

  for (const t of summary.accounts) {
    if (t.wrapper !== 'af') continue;
    const a = plan.accounts.find((x) => x.id === t.accountId);
    if (!a || (a.expectedReturn ?? 0) <= summary.year.schablonRate || a.balance < MIN_NUDGE) continue;
    out.push({
      kind: 'af_to_isk',
      accountId: a.id,
      name: a.name,
      expectedReturn: a.expectedReturn ?? 0,
      breakEven: summary.year.schablonRate,
      taxIfSold: t.taxIfSold,
      gain: t.gain,
      room: summary.taxFreeLeft,
    });
  }

  const byBank = new Map<string, { institution: string; amount: number }>();
  for (const a of plan.accounts) {
    const bank = a.institution?.trim();
    if (!bank || wrapperOf(a.kind) !== 'cash') continue;
    const key = bank.toLowerCase();
    const entry = byBank.get(key) ?? { institution: bank, amount: 0 };
    entry.amount += Math.max(0, a.balance);
    byBank.set(key, entry);
  }
  for (const { institution, amount } of byBank.values()) {
    if (amount > DEPOSIT_GUARANTEE) out.push({ kind: 'deposit_guarantee', institution, amount });
  }
  return out;
}
