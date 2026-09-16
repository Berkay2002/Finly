import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  amortizationRequirement,
  csnFirstYearly,
  csnIncomeBasedYearly,
  debtFlow,
  debtPayoff,
  hasAssetValue,
  interestBeforeRepayment,
  interestTaxReduction,
  isDeductible,
  mortgageRateType,
  nextCsnDueDate,
  paymentsPerYear,
  repaymentStart,
} from '@/engine/debts';
import { formatDate, formatDuration, formatMoney, formatMonthYear, formatNumber } from '@/engine/format';
import {
  BUNDLED_OUTLOOK,
  csnRateDecided,
  csnRateForYear,
  fixedRateResets,
  forecastRates,
  type RateOutlook,
} from '@/engine/rates';
import { DEBT_KINDS, debtKindMeta, debtName } from '@/engine/taxonomy';
import type { CsnLoanType, Debt, DebtFrequency, DebtKind, MortgageRateType } from '@/engine/types';
import { allMessages, messages, useT } from '@/i18n';
import { useRateOutlook } from '@/lib/rateOutlook';
import { usePlanStore } from '@/store/planStore';
import { useCurrency, usePlan, useViewDate } from '@/store/selectors';
import type { Accent } from '@/components/ui/accent';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Chip } from '@/components/ui/Chip';
import { Delta } from '@/components/ui/Delta';
import type { IconSource } from '@/components/ui/Icon';
import { DateField, MoneyField, SegmentedControl, SelectField, Switch, TextField } from '@/components/ui/fields';
import { Sheet } from '@/components/ui/Sheet';
import { BirthYearField } from './BirthYearField';
import { ItemRow } from './ItemRow';

export type LoanDraft = Omit<Debt, 'id'> & { id?: string };
type Draft = LoanDraft;

export const DEBT_ICON: Record<DebtKind, IconSource> = {
  csn: 'goal-graduation',
  mortgage: 'goal-home',
  car: 'goal-car',
  personal: 'account-cash',
  credit_card: 'account-everyday',
  other: 'account-other',
};

export const DEBT_ACCENT: Record<DebtKind, Accent> = {
  csn: 'indigo',
  mortgage: 'red',
  car: 'orange',
  personal: 'yellow',
  credit_card: 'purple',
  other: 'neutral',
};

export function blankLoan(kind: DebtKind = 'csn', now: Date = new Date(), outlook: RateOutlook = BUNDLED_OUTLOOK): Draft {
  const meta = debtKindMeta(kind);
  const year = now.getFullYear();
  return {
    name: meta.name,
    lender: kind === 'csn' ? 'CSN' : '',
    kind,
    balance: 0,
    payment: 0,
    frequency: meta.frequency,
    secured: kind === 'car' ? true : undefined,
    rateType: kind === 'mortgage' ? 'variable' : undefined,
    ...(kind === 'csn'
      ? { rate: csnRateForYear(outlook, year), rateYear: year, csnType: 'annuity' as const, nextDate: nextCsnDueDate(now) }
      : {}),
  };
}

/** Keeps a draft consistent before saving: a mortgage's payment follows from amortering and interest. */
function finalize(d: Draft, now: Date): Draft {
  const out = { ...d, name: d.name.trim() };
  // A CSN rate saved before rateYear existed was entered for this year's rate.
  out.rateYear = out.kind === 'csn' && out.rate !== undefined ? (out.rateYear ?? now.getFullYear()) : undefined;
  if (out.kind !== 'csn') out.csnBefore2022 = undefined;
  if (out.kind !== 'mortgage') out.propertyValue = undefined;
  if (!hasAssetValue(out)) out.assetValue = undefined;
  if (out.kind === 'mortgage') {
    out.rateType = mortgageRateType(out);
    if (out.rateType === 'variable') out.rateFixedUntil = undefined;
    out.payment = debtFlow({ ...out, id: '' }).monthly;
  } else {
    out.rateType = undefined;
    out.rateFixedUntil = undefined;
  }
  if (out.frequency === 'monthly') out.nextDate = undefined;
  return out;
}

function payoffText(d: Debt, now: Date): string | null {
  const p = debtPayoff(d, now);
  if (!p) return null;
  const t = messages().loans.editor;
  if (!Number.isFinite(p.months)) return t.neverPaidOff;
  return t.debtFree(formatMonthYear(p.date!));
}

export function LoanEditor({
  autoOpenAdd = false,
  previous,
}: {
  autoOpenAdd?: boolean;
  /** Balances at the previous month's close, by loan id. */
  previous?: Record<string, number>;
}) {
  const plan = usePlan();
  const currency = useCurrency();
  const now = useViewDate();
  const { updateDebt, removeDebt } = usePlanStore();
  const loans = useLoanSheet();
  const debts = plan.debts ?? [];
  const t = useT().loans;

  useEffect(() => {
    if (autoOpenAdd) loans.openNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenAdd]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-muted">
          {debts.length === 0 ? t.editor.noLoans : t.common.loanCount(debts.length)}
        </p>
        <Button variant="secondary" size="sm" icon={Plus} onClick={() => loans.openNew()}>
          {t.common.addLoan}
        </Button>
      </div>

      <div className="space-y-2">
        {debts.map((d) => {
          const flow = debtFlow(d);
          const payoff = payoffText(d, now);
          return (
            <ItemRow
              key={d.id}
              icon={DEBT_ICON[d.kind]}
              accent={DEBT_ACCENT[d.kind]}
              title={debtName(d)}
              onClick={() => loans.openEdit(d.id)}
              meta={
                <>
                  <span>{d.lender || debtKindMeta(d.kind).label}</span>
                  {d.rate !== undefined && <span>· {formatNumber(d.rate, 3)} %</span>}
                  {flow.monthly > 0 && <span>· {t.common.perMonth(formatMoney(flow.monthly, currency))}</span>}
                  {payoff && <span className={payoff === t.editor.neverPaidOff ? 'text-warning' : undefined}>· {payoff}</span>}
                  {d.kind === 'mortgage' && <Chip tone="neutral">{rateTypeLabel(d)}</Chip>}
                  {isDeductible(d) && <Chip tone="brand">{t.editor.deductibleChip}</Chip>}
                  {previous && <Delta before={previous[d.id]} after={d.balance} invert className="ml-1" />}
                </>
              }
              fields={
                <MoneyField
                  size="sm"
                  currency={currency}
                  value={d.balance}
                  aria-label={t.editor.balanceOwed}
                  onValueChange={(balance) => updateDebt(d.id, { balance })}
                  className="min-w-0 flex-1 sm:w-40 sm:flex-none"
                />
              }
              menu={[
                { label: t.editor.editDetails, icon: Pencil, onSelect: () => loans.openEdit(d.id) },
                { label: t.common.remove, icon: Trash2, danger: true, onSelect: () => removeDebt(d.id) },
              ]}
            />
          );
        })}
        {debts.length === 0 && (
          <button
            type="button"
            onClick={() => loans.openNew()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-page/60 px-3 py-5 text-[13px] font-medium text-brand-700 hover:bg-brand-50"
          >
            <Plus size={14} /> {t.editor.addFirst}
          </button>
        )}
      </div>
      {loans.sheet}
    </div>
  );
}

const pct = (n: number) => `${formatNumber(n, 3)} %`;

/** "Variable", or "Fixed until Oct 2027" style label for a mortgage part. */
export function rateTypeLabel(d: Pick<Debt, 'rateType' | 'rateFixedUntil'>): string {
  const t = messages().loans.editor;
  if (mortgageRateType(d) === 'variable') return t.variable;
  return d.rateFixedUntil ? t.fixedUntil(formatMonthYear(new Date(`${d.rateFixedUntil}T00:00:00`))) : t.fixed;
}

/** Whether a name is a loan kind's default name in any language, so switching language does not make it look typed. */
function isDefaultName(name: string, kind: DebtKind): boolean {
  return allMessages().some((m) => m.taxonomy.debtKinds[kind].name === name);
}

export function LoanSheet({
  draft,
  onChange,
  onClose,
  onSave,
  onRemove,
}: {
  draft: Draft | null;
  onChange: (d: Draft) => void;
  onClose: () => void;
  onSave: () => void;
  onRemove?: () => void;
}) {
  const currency = useCurrency();
  const now = useViewDate();
  const plan = usePlan();
  const outlook = useRateOutlook();
  const [grossIncome, setGrossIncome] = useState(0);
  const money = (n: number) => formatMoney(n, currency);
  const t = useT().loans;

  const setKind = (kind: DebtKind) => {
    if (!draft) return;
    const fresh = blankLoan(kind, now, outlook);
    onChange({
      ...fresh,
      id: draft.id,
      // A name the user typed stays; the old type's default name follows the new type, on saved loans too.
      name: draft.name.trim() && !isDefaultName(draft.name, draft.kind) ? draft.name : fresh.name,
      balance: draft.balance,
      lender: draft.lender && draft.lender !== 'CSN' ? draft.lender : fresh.lender,
      rate: kind === 'csn' ? fresh.rate : draft.kind === 'csn' ? undefined : draft.rate,
      payment: kind === 'mortgage' ? 0 : draft.payment,
      frequency: fresh.frequency,
    });
  };

  const d = draft ? ({ ...draft, id: draft.id ?? 'draft' } as Debt) : null;
  const flow = d ? debtFlow(d) : null;
  const payoff = d ? debtPayoff(d, now) : null;
  // Only mortgages and CSN follow the policy rate; other loans keep today's rate in the forecast too.
  const household = d ? [...(plan.debts ?? []).filter((x) => x.id !== d.id), d] : [];
  const ahead =
    d && (d.kind === 'mortgage' || d.kind === 'csn') && d.rate !== undefined
      ? debtPayoff(d, now, forecastRates(d, now, outlook, household))
      : null;
  const reset = d && d.kind === 'mortgage' ? fixedRateResets(household, now, outlook, 12).find((r) => r.debt.id === d.id) : undefined;
  const before = d ? interestBeforeRepayment(d, now, d.kind === 'csn' ? forecastRates(d, now, outlook, household) : undefined) : null;

  return (
    <Sheet
      open={draft !== null}
      onClose={onClose}
      title={draft?.id ? t.common.editLoan : t.common.addLoan}
      footer={
        <div className="flex items-center justify-between gap-2">
          {draft?.id && onRemove ? (
            <Button variant="danger" onClick={onRemove}>
              {t.common.remove}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button onClick={onSave} disabled={!draft?.name.trim()}>
              {draft?.id ? t.common.save : t.common.addLoan}
            </Button>
          </div>
        </div>
      }
    >
      {draft && d && flow && (
        <div className="space-y-4">
          <SelectField
            label={t.sheet.type}
            value={draft.kind}
            onValueChange={setKind}
            options={DEBT_KINDS.map((k) => ({ value: k.id, label: k.label }))}
          />
          <p className="-mt-2 text-[12px] text-muted">{debtKindMeta(draft.kind).description}</p>

          <div className="grid grid-cols-2 gap-3">
            <TextField label={t.sheet.name} value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} />
            <TextField
              label={t.sheet.lender}
              hint={t.sheet.optional}
              placeholder={draft.kind === 'mortgage' ? t.sheet.lenderPlaceholderMortgage : t.sheet.lenderPlaceholder}
              value={draft.lender ?? ''}
              onChange={(e) => onChange({ ...draft, lender: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MoneyField
              label={t.editor.balanceOwed}
              currency={currency}
              value={draft.balance}
              onValueChange={(balance) => onChange({ ...draft, balance })}
            />
            <div>
              <MoneyField
                label={t.sheet.interestRate}
                currency="%"
                value={draft.rate ?? 0}
                onValueChange={(v) =>
                  onChange({ ...draft, rate: v > 0 ? v : undefined, rateYear: draft.kind === 'csn' ? now.getFullYear() : undefined })
                }
              />
              {draft.kind === 'csn' && <CsnRateHint draft={draft} onChange={onChange} />}
            </div>
          </div>

          {draft.kind === 'csn' && <CsnFields draft={draft} onChange={onChange} grossIncome={grossIncome} setGrossIncome={setGrossIncome} />}
          {draft.kind === 'mortgage' && <MortgageFields draft={draft} onChange={onChange} />}
          {draft.kind !== 'csn' && draft.kind !== 'mortgage' && (
            <>
              <MoneyField
                label={t.sheet.monthlyPayment}
                hint={draft.kind === 'credit_card' ? t.sheet.monthlyPaymentCardHint : t.sheet.monthlyPaymentHint}
                currency={currency}
                value={draft.payment}
                onValueChange={(payment) => onChange({ ...draft, payment, frequency: 'monthly' })}
              />
              {(draft.kind === 'car' || draft.kind === 'other') && (
                <Switch
                  checked={!!draft.secured}
                  onChange={(secured) => onChange({ ...draft, secured })}
                  label={t.sheet.secured}
                  description={draft.kind === 'car' ? t.sheet.securedCar : t.sheet.securedOther}
                />
              )}
              {hasAssetValue(draft) && (
                <MoneyField
                  label={draft.kind === 'car' ? t.sheet.carValue : t.sheet.propertyValue}
                  hint={t.sheet.assetValueHint}
                  currency={currency}
                  value={draft.assetValue ?? 0}
                  onValueChange={(v) => onChange({ ...draft, assetValue: v > 0 ? v : undefined })}
                />
              )}
            </>
          )}

          <div className="rounded-xl bg-page px-3.5 py-3 text-[12.5px] text-ink-soft">
            {flow.monthly > 0 ? (
              <p>
                <span className="font-semibold text-ink">{money(flow.monthly)}</span>
                {t.sheet.aMonth}
                {flow.interest !== null && flow.principal !== null && t.sheet.split(money(flow.interest), money(flow.principal))}
                .
              </p>
            ) : (
              <p>{t.sheet.enterPayment}</p>
            )}
            {before && <p className="mt-1">{t.sheet.interestBefore(formatDate(before.start), money(before.interest))}</p>}
            {isDeductible(d) && flow.interest !== null && flow.interest > 0 && (
              <p className="mt-1">{t.sheet.deduction(money(interestTaxReduction(flow.interest * 12) / 12))}</p>
            )}
            {!isDeductible(d) && draft.kind !== 'csn' && <p className="mt-1">{t.sheet.noDeduction}</p>}
            {payoff && (
              <p className="mt-1">
                {Number.isFinite(payoff.months) ? (
                  t.sheet.payoff(
                    formatDuration(payoff.months),
                    formatMonthYear(payoff.date!),
                    money(payoff.totalInterest ?? 0),
                    draft.kind === 'csn' && draft.csnType !== 'income_based',
                  )
                ) : (
                  <span className="text-warning">{t.sheet.neverShrinks}</span>
                )}
              </p>
            )}
            {payoff && ahead && Number.isFinite(payoff.months) && Math.abs((ahead.totalInterest ?? 0) - (payoff.totalInterest ?? 0)) >= 1 && (
              <p className="mt-1">
                {Number.isFinite(ahead.months)
                  ? t.sheet.forecastPayoff(
                      ahead.months !== payoff.months ? formatMonthYear(ahead.date!) : null,
                      money(ahead.totalInterest ?? 0),
                    )
                  : t.sheet.forecastNever}
              </p>
            )}
            {reset && (
              <p className="mt-1">
                {t.sheet.reset(
                  reset.passed,
                  formatDate(reset.date),
                  pct(Math.round(reset.newRate * 100) / 100),
                  money(Math.abs(reset.monthlyChange)),
                  reset.monthlyChange >= 0,
                )}
              </p>
            )}
          </div>

          {draft.kind === 'mortgage' && <MortgageRequirement draft={d} />}
        </div>
      )}
    </Sheet>
  );
}

/**
 * CSN's rate for this year as a one-click fill (its rate changes every January), and the rate expected
 * when the next payment falls in a later year.
 */
function CsnRateHint({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const now = useViewDate();
  const outlook = useRateOutlook();
  const loan = { ...draft, id: draft.id ?? 'draft' } as Debt;
  const year = now.getFullYear();
  const current = csnRateForYear(outlook, year);
  const due = draft.frequency !== 'monthly' && draft.nextDate ? new Date(`${draft.nextDate}T00:00:00`) : null;
  const dueYear = due && due.getFullYear() > year ? due.getFullYear() : null;
  // CSN charges everyone the same rate, so what is typed for this year does not change the next.
  const then = dueYear !== null ? csnRateForYear(outlook, dueYear) : undefined;
  const differs = draft.rate === undefined || Math.abs(draft.rate - current) >= 0.0005;
  const t = useT().loans;
  const about = (y: number, n: number) => (csnRateDecided(y) ? pct(n) : t.common.about(pct(Math.round(n * 100) / 100)));

  return (
    <>
      {differs && (
        <button
          type="button"
          className="mt-1 text-left text-[12px] font-medium text-brand-700 hover:underline"
          onClick={() => onChange({ ...draft, rate: current, rateYear: year })}
        >
          {t.csn.useRate(year, csnRateDecided(year), about(year, current))}
        </button>
      )}
      {then !== undefined && dueYear !== null && (
        <p className="mt-1 text-[12px] text-muted">
          {t.csn.expect(csnRateDecided(dueYear), about(dueYear, then), dueYear, !!repaymentStart(loan, now))}
        </p>
      )}
    </>
  );
}

/**
 * CSN's likely first årsbelopp for a loan whose repayment has not started. Asks for the birth year (saved to
 * the plan) when the plan does not have it yet, since it can shorten the repayment time. See `csnFirstYearly`.
 */
function CsnFirstYearly({
  draft,
  onChange,
  first,
  yearly,
  setYearly,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  first: NonNullable<ReturnType<typeof csnFirstYearly>>;
  yearly: number;
  setYearly: (y: number) => void;
}) {
  const currency = useCurrency();
  const plan = usePlan();
  // Decided when the sheet opens, so the field stays put while the year is typed into the plan.
  const [askBirthYear] = useState(() => !plan.birthYear);
  const money = (n: number) => formatMoney(n, currency);
  const estimate = Math.round(first.yearly);
  const age = plan.birthYear ? first.year - plan.birthYear : 0;
  const rate = pct(Math.round(first.rate * 100) / 100);
  const t = useT().loans.csn;

  return (
    <div className="space-y-3 rounded-xl border border-line px-3.5 py-3">
      <div className="text-[12.5px] text-ink-soft">
        <div className="font-medium text-ink">{t.firstYearly(first.year, money(estimate))}</div>
        <p className="mt-0.5 text-muted">
          {first.minimum ? t.minimum(money(first.debt), first.years) : t.spread(money(first.debt), first.years, rate)}{' '}
          {t.realAmount}
        </p>
        {Math.abs(yearly - estimate) >= 1 && (
          <button
            type="button"
            className="mt-1 text-[12px] font-medium text-brand-700 hover:underline"
            onClick={() => setYearly(estimate)}
          >
            {t.useYearly(money(estimate))}
          </button>
        )}
      </div>
      {askBirthYear ? (
        <BirthYearField hint={t.birthYearHint} />
      ) : (
        <p className="text-[12px] text-muted">{t.born(plan.birthYear ?? '')}</p>
      )}
      {age > 36 && (
        <Switch
          checked={!!draft.csnBefore2022}
          onChange={(csnBefore2022) => onChange({ ...draft, csnBefore2022 })}
          label={t.before2022}
          description={t.before2022Description}
        />
      )}
    </div>
  );
}

function CsnFields({
  draft,
  onChange,
  grossIncome,
  setGrossIncome,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  grossIncome: number;
  setGrossIncome: (n: number) => void;
}) {
  const currency = useCurrency();
  const now = useViewDate();
  const perYear = paymentsPerYear(draft.frequency);
  const yearly = draft.payment * perYear;
  const setYearly = (y: number, frequency: DebtFrequency = draft.frequency) =>
    onChange({ ...draft, payment: y / paymentsPerYear(frequency), frequency });
  const suggested = csnIncomeBasedYearly(grossIncome);
  const outlook = useRateOutlook();
  const loan = { ...draft, id: draft.id ?? 'draft' } as Debt;
  const birthYear = usePlan().birthYear;
  const first = csnFirstYearly(loan, now, forecastRates(loan, now, outlook, [loan]), birthYear);
  const t = useT().loans.csn;

  return (
    <>
      <SelectField
        label={t.loan}
        value={draft.csnType ?? 'annuity'}
        onValueChange={(csnType: CsnLoanType) => onChange({ ...draft, csnType })}
        options={[
          { value: 'annuity', label: t.annuity },
          { value: 'income_based', label: t.incomeBased },
        ]}
      />
      <div className="grid grid-cols-2 gap-3">
        <MoneyField
          label={t.yearly}
          hint={t.perYear}
          currency={currency}
          value={Math.round(yearly * 100) / 100}
          onValueChange={(y) => setYearly(y)}
        />
        <SelectField
          label={t.paid}
          value={draft.frequency === 'monthly' ? 'monthly' : 'quarterly'}
          onValueChange={(f: DebtFrequency) =>
            onChange({
              ...draft,
              payment: yearly / paymentsPerYear(f),
              frequency: f,
              nextDate: f === 'monthly' ? undefined : draft.nextDate ?? nextCsnDueDate(now),
            })
          }
          options={[
            { value: 'quarterly', label: t.quarterly },
            { value: 'monthly', label: t.monthly },
          ]}
        />
      </div>
      {draft.frequency !== 'monthly' && (
        <DateField
          label={t.nextPayment}
          hint={t.eachTime(formatMoney(draft.payment, currency))}
          value={draft.nextDate ?? ''}
          onChange={(e) => onChange({ ...draft, nextDate: e.target.value || undefined })}
        />
      )}
      {first && <CsnFirstYearly draft={draft} onChange={onChange} first={first} yearly={yearly} setYearly={setYearly} />}
      {draft.csnType === 'income_based' && (
        <div>
          <MoneyField
            label={t.income}
            hint={t.incomeHint}
            currency={currency}
            value={grossIncome}
            onValueChange={setGrossIncome}
          />
          {suggested > 0 && (
            <button
              type="button"
              className="mt-1 text-[12px] font-medium text-brand-700 hover:underline"
              onClick={() => setYearly(suggested)}
            >
              {t.useIncomeShare(formatMoney(suggested, currency))}
            </button>
          )}
        </div>
      )}
      <Callout tone="info" icon="goal-graduation" title={t.rulesTitle}>
        {t.rules(draft.csnType !== 'income_based')}
      </Callout>
    </>
  );
}

function MortgageFields({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const currency = useCurrency();
  const plan = usePlan();
  const others = (plan.debts ?? []).filter((x) => x.kind === 'mortgage' && x.id !== draft.id);
  const req = amortizationRequirement([...others, { ...draft, id: draft.id ?? 'draft' } as Debt]);
  // The requirement covers all parts of the mortgage; this part's share of it follows its balance.
  const totalBalance = others.reduce((a, x) => a + x.balance, 0) + draft.balance;
  const share = req && totalBalance > 0 ? (req.monthly * draft.balance) / totalBalance : 0;
  const type = mortgageRateType(draft);
  const t = useT().loans.mortgage;

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <MoneyField
            label={t.amortization}
            hint={t.perMonth}
            currency={currency}
            value={draft.amortization ?? 0}
            onValueChange={(v) => onChange({ ...draft, amortization: v })}
          />
          {req && req.percent > 0 && Math.abs((draft.amortization ?? 0) - share) > 0.5 && (
            <button
              type="button"
              className="mt-1 text-[12px] font-medium text-brand-700 hover:underline"
              onClick={() => onChange({ ...draft, amortization: Math.ceil(share) })}
            >
              {t.useRequirement(formatMoney(Math.ceil(share), currency))}
            </button>
          )}
        </div>
        <div>
          <MoneyField
            label={t.homeValue}
            currency={currency}
            value={draft.propertyValue ?? 0}
            onValueChange={(v) => onChange({ ...draft, propertyValue: v > 0 ? v : undefined })}
          />
          {/* Below the field, not in the label, so a wrapping hint does not push this input below Amortering. */}
          <p className="mt-1 text-[12px] text-muted">{others.some((x) => x.propertyValue) ? t.sameHome : t.forRequirement}</p>
        </div>
      </div>
      <div>
        <div className="mb-1 text-[12.5px] font-medium text-ink-soft">{t.rate}</div>
        <SegmentedControl
          value={type}
          onChange={(rateType: MortgageRateType) => onChange({ ...draft, rateType })}
          options={[
            { value: 'variable', label: t.variableOption },
            { value: 'fixed', label: t.fixedOption },
          ]}
        />
        <p className="mt-1 text-[12px] text-muted">
          {type === 'variable' ? t.variableDescription : t.fixedDescription}
        </p>
      </div>
      {type === 'fixed' && (
        <DateField
          label={t.fixedUntil}
          hint={t.fixedUntilHint}
          value={draft.rateFixedUntil ?? ''}
          onChange={(e) => onChange({ ...draft, rateFixedUntil: e.target.value || undefined })}
        />
      )}
    </>
  );
}

function MortgageRequirement({ draft }: { draft: Debt }) {
  const plan = usePlan();
  const currency = useCurrency();
  const all = [...(plan.debts ?? []).filter((x) => x.id !== draft.id), draft];
  const req = amortizationRequirement(all);
  const t = useT().loans.mortgage;
  if (!req) return null;
  const ltv = `${Math.round(req.ltv * 100)} %`;
  if (req.percent === 0) {
    return (
      <Callout tone="success" title={t.ltvTitle(ltv)}>
        {t.noRequirement}
      </Callout>
    );
  }
  return (
    <Callout tone={req.short ? 'warning' : 'success'} title={t.requirementTitle(ltv, req.percent)}>
      {t.requirement(formatMoney(req.monthly, currency), formatMoney(req.current, currency), req.ltv > 0.9)}
    </Callout>
  );
}

/**
 * Loan editing state plus the rendered sheet, for pages that show loans (Home, Planning, Loans).
 * Render `sheet` once anywhere in the page.
 */
export function useLoanSheet() {
  const plan = usePlan();
  const now = useViewDate();
  const outlook = useRateOutlook();
  const { addDebt, updateDebt, removeDebt } = usePlanStore();
  const [draft, setDraft] = useState<Draft | null>(null);
  const openEdit = (id: string) => {
    const d = (plan.debts ?? []).find((x) => x.id === id);
    if (d) setDraft({ ...d, name: debtName(d) });
  };
  const openNew = (kind?: DebtKind) => setDraft(blankLoan(kind, now, outlook));
  const close = () => setDraft(null);
  const save = () => {
    if (!draft) return;
    const next = finalize(draft, now);
    if (next.id) {
      const { id, ...patch } = next;
      updateDebt(id, patch);
    } else addDebt(next);
    setDraft(null);
  };
  const remove = () => {
    if (draft?.id) removeDebt(draft.id);
    setDraft(null);
  };
  const sheet = <LoanSheet draft={draft} onChange={setDraft} onClose={close} onSave={save} onRemove={remove} />;
  return { draft, openEdit, openNew, close, sheet };
}
