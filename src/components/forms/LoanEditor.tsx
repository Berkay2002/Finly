import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  amortizationRequirement,
  CSN_RATE_2026,
  csnIncomeBasedYearly,
  debtFlow,
  debtPayoff,
  interestTaxReduction,
  isDeductible,
  mortgageRateType,
  nextCsnDueDate,
  paymentsPerYear,
} from '@/engine/debts';
import { formatDate, formatDuration, formatMoney, formatMonthYear } from '@/engine/format';
import { fixedRateResets, forecastRates } from '@/engine/rates';
import { DEBT_KINDS, debtKindMeta } from '@/engine/taxonomy';
import type { CsnLoanType, Debt, DebtFrequency, DebtKind, MortgageRateType } from '@/engine/types';
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

export function blankLoan(kind: DebtKind = 'csn', now: Date = new Date()): Draft {
  const meta = debtKindMeta(kind);
  return {
    name: meta.name,
    lender: kind === 'csn' ? 'CSN' : '',
    kind,
    balance: 0,
    payment: 0,
    frequency: meta.frequency,
    secured: kind === 'car' ? true : undefined,
    rateType: kind === 'mortgage' ? 'variable' : undefined,
    ...(kind === 'csn' ? { rate: CSN_RATE_2026, csnType: 'annuity' as const, nextDate: nextCsnDueDate(now) } : {}),
  };
}

/** Keeps a draft consistent before saving: a mortgage's payment follows from amortering and interest. */
function finalize(d: Draft): Draft {
  const out = { ...d, name: d.name.trim() };
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
  if (!Number.isFinite(p.months)) return 'Never paid off at this rate';
  return `Debt-free ${formatMonthYear(p.date!)}`;
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

  useEffect(() => {
    if (autoOpenAdd) loans.openNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenAdd]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-muted">
          {debts.length === 0 ? 'No loans yet.' : `${debts.length} loan${debts.length === 1 ? '' : 's'}`}
        </p>
        <Button variant="secondary" size="sm" icon={Plus} onClick={() => loans.openNew()}>
          Add loan
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
              title={d.name}
              onClick={() => loans.openEdit(d.id)}
              meta={
                <>
                  <span>{d.lender || debtKindMeta(d.kind).label}</span>
                  {d.rate !== undefined && <span>· {d.rate.toLocaleString('sv-SE', { maximumFractionDigits: 3 })} %</span>}
                  {flow.monthly > 0 && <span>· {formatMoney(flow.monthly, currency)}/mo</span>}
                  {payoff && <span className={payoff.startsWith('Never') ? 'text-warning' : undefined}>· {payoff}</span>}
                  {d.kind === 'mortgage' && <Chip tone="neutral">{rateTypeLabel(d)}</Chip>}
                  {isDeductible(d) && <Chip tone="brand">Ränteavdrag</Chip>}
                  {previous && <Delta before={previous[d.id]} after={d.balance} invert className="ml-1" />}
                </>
              }
              fields={
                <MoneyField
                  size="sm"
                  currency={currency}
                  value={d.balance}
                  aria-label="Balance owed"
                  onValueChange={(balance) => updateDebt(d.id, { balance })}
                  className="min-w-0 flex-1 sm:w-40 sm:flex-none"
                />
              }
              menu={[
                { label: 'Edit details', icon: Pencil, onSelect: () => loans.openEdit(d.id) },
                { label: 'Remove', icon: Trash2, danger: true, onSelect: () => removeDebt(d.id) },
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
            <Plus size={14} /> Add a loan: CSN, bolån, billån or credit
          </button>
        )}
      </div>
      {loans.sheet}
    </div>
  );
}

const pct = (n: number) => `${n.toLocaleString('sv-SE', { maximumFractionDigits: 3 })} %`;

/** "Rörlig", or "Bunden till okt 2027" style label for a mortgage part. */
export function rateTypeLabel(d: Pick<Debt, 'rateType' | 'rateFixedUntil'>): string {
  if (mortgageRateType(d) === 'variable') return 'Rörlig';
  return d.rateFixedUntil ? `Bunden till ${formatMonthYear(new Date(`${d.rateFixedUntil}T00:00:00`))}` : 'Bunden';
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

  const setKind = (kind: DebtKind) => {
    if (!draft) return;
    const fresh = blankLoan(kind, now);
    onChange({
      ...fresh,
      id: draft.id,
      name: draft.id || draft.name !== debtKindMeta(draft.kind).name ? draft.name : fresh.name,
      balance: draft.balance,
      lender: draft.lender && draft.lender !== 'CSN' ? draft.lender : fresh.lender,
      rate: kind === 'csn' ? CSN_RATE_2026 : draft.kind === 'csn' ? undefined : draft.rate,
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

  return (
    <Sheet
      open={draft !== null}
      onClose={onClose}
      title={draft?.id ? 'Edit loan' : 'Add loan'}
      footer={
        <div className="flex items-center justify-between gap-2">
          {draft?.id && onRemove ? (
            <Button variant="danger" onClick={onRemove}>
              Remove
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={!draft?.name.trim()}>
              {draft?.id ? 'Save' : 'Add loan'}
            </Button>
          </div>
        </div>
      }
    >
      {draft && d && flow && (
        <div className="space-y-4">
          <SelectField
            label="Type"
            value={draft.kind}
            onValueChange={setKind}
            options={DEBT_KINDS.map((k) => ({ value: k.id, label: k.label }))}
          />
          <p className="-mt-2 text-[12px] text-muted">{debtKindMeta(draft.kind).description}</p>

          <div className="grid grid-cols-2 gap-3">
            <TextField label="Name" value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} />
            <TextField
              label="Lender"
              hint="(optional)"
              placeholder={draft.kind === 'mortgage' ? 'e.g. SBAB, Swedbank' : 'e.g. Santander, Nordea'}
              value={draft.lender ?? ''}
              onChange={(e) => onChange({ ...draft, lender: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MoneyField
              label="Balance owed"
              currency={currency}
              value={draft.balance}
              onValueChange={(balance) => onChange({ ...draft, balance })}
            />
            <div>
              <MoneyField
                label="Interest rate"
                currency="%"
                value={draft.rate ?? 0}
                onValueChange={(v) => onChange({ ...draft, rate: v > 0 ? v : undefined })}
              />
              {draft.kind === 'csn' && draft.rate !== CSN_RATE_2026 && (
                <button
                  type="button"
                  className="mt-1 text-[12px] font-medium text-brand-700 hover:underline"
                  onClick={() => onChange({ ...draft, rate: CSN_RATE_2026 })}
                >
                  Use CSN's 2026 rate, {pct(CSN_RATE_2026)}
                </button>
              )}
            </div>
          </div>

          {draft.kind === 'csn' && <CsnFields draft={draft} onChange={onChange} grossIncome={grossIncome} setGrossIncome={setGrossIncome} />}
          {draft.kind === 'mortgage' && <MortgageFields draft={draft} onChange={onChange} />}
          {draft.kind !== 'csn' && draft.kind !== 'mortgage' && (
            <>
              <MoneyField
                label="Monthly payment"
                hint={draft.kind === 'credit_card' ? '(what you pay each month)' : '(interest and repayment together)'}
                currency={currency}
                value={draft.payment}
                onValueChange={(payment) => onChange({ ...draft, payment, frequency: 'monthly' })}
              />
              {(draft.kind === 'car' || draft.kind === 'other') && (
                <Switch
                  checked={!!draft.secured}
                  onChange={(secured) => onChange({ ...draft, secured })}
                  label="Secured against the car or other property"
                  description={
                    draft.kind === 'car'
                      ? 'Most billån through a dealer are secured by the car (the lender can take it back). A blancolån used to buy a car is not.'
                      : 'Secured loans keep ränteavdrag; unsecured loans lost it from 2026.'
                  }
                />
              )}
            </>
          )}

          <div className="rounded-xl bg-page px-3.5 py-3 text-[12.5px] text-ink-soft">
            {flow.monthly > 0 ? (
              <p>
                <span className="font-semibold text-ink">{money(flow.monthly)}</span> a month
                {flow.interest !== null && flow.principal !== null && (
                  <>
                    : {money(flow.interest)} interest, {money(flow.principal)} repays the loan
                  </>
                )}
                .
              </p>
            ) : (
              <p>Enter the payment to see where it goes.</p>
            )}
            {isDeductible(d) && flow.interest !== null && flow.interest > 0 && (
              <p className="mt-1">
                Ränteavdrag gives back about {money(interestTaxReduction(flow.interest * 12) / 12)} a month through your tax.
              </p>
            )}
            {!isDeductible(d) && draft.kind !== 'csn' && (
              <p className="mt-1">No ränteavdrag: unsecured loans lost it from income year 2026.</p>
            )}
            {payoff && (
              <p className="mt-1">
                {Number.isFinite(payoff.months) ? (
                  <>
                    Debt-free in {formatDuration(payoff.months)} ({formatMonthYear(payoff.date!)}), with{' '}
                    {money(payoff.totalInterest ?? 0)} interest left to pay
                    {draft.kind === 'csn' && draft.csnType !== 'income_based' ? ', counting CSN’s yearly step-up' : ''}.
                  </>
                ) : (
                  <span className="text-warning">The payment does not cover the interest, so the balance never shrinks.</span>
                )}
              </p>
            )}
            {payoff && ahead && Number.isFinite(payoff.months) && Math.abs((ahead.totalInterest ?? 0) - (payoff.totalInterest ?? 0)) >= 1 && (
              <p className="mt-1">
                If rates follow the Riksbank's forecast:{' '}
                {Number.isFinite(ahead.months) ? (
                  <>
                    {ahead.months !== payoff.months && <>debt-free {formatMonthYear(ahead.date!)}, </>}
                    {money(ahead.totalInterest ?? 0)} interest left to pay.
                  </>
                ) : (
                  'the payment stops covering the interest.'
                )}
              </p>
            )}
            {reset && (
              <p className="mt-1">
                {reset.passed ? 'The fixed rate ended' : 'Bunden until'} {formatDate(reset.date)}. After that, expect about{' '}
                {pct(Math.round(reset.newRate * 100) / 100)}: {money(Math.abs(reset.monthlyChange))} a month{' '}
                {reset.monthlyChange >= 0 ? 'more' : 'less'} in interest at today's balance.
              </p>
            )}
          </div>

          {draft.kind === 'mortgage' && <MortgageRequirement draft={d} />}
        </div>
      )}
    </Sheet>
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

  return (
    <>
      <SelectField
        label="Loan"
        value={draft.csnType ?? 'annuity'}
        onValueChange={(csnType: CsnLoanType) => onChange({ ...draft, csnType })}
        options={[
          { value: 'annuity', label: 'Annuitetslån (from July 2001)' },
          { value: 'income_based', label: 'Studielån (1989 to June 2001)' },
        ]}
      />
      <div className="grid grid-cols-2 gap-3">
        <MoneyField
          label="Årsbelopp"
          hint="(per year)"
          currency={currency}
          value={Math.round(yearly * 100) / 100}
          onValueChange={(y) => setYearly(y)}
        />
        <SelectField
          label="Paid"
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
            { value: 'quarterly', label: 'Four times a year' },
            { value: 'monthly', label: 'Every month' },
          ]}
        />
      </div>
      {draft.frequency !== 'monthly' && (
        <DateField
          label="Next payment due"
          hint={`(${formatMoney(draft.payment, currency)} each time)`}
          value={draft.nextDate ?? ''}
          onChange={(e) => onChange({ ...draft, nextDate: e.target.value || undefined })}
        />
      )}
      {draft.csnType === 'income_based' && (
        <div>
          <MoneyField
            label="Income two years ago"
            hint="(before tax, to work out the årsbelopp)"
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
              Use 4 % of it: {formatMoney(suggested, currency)} a year
            </button>
          )}
        </div>
      )}
      <Callout tone="info" icon="goal-graduation" title="CSN plays by its own rules">
        No ränteavdrag on CSN interest. If your income drops you can apply for a lower payment (nedsättning, 5 % of
        income, 7 % from age 50), and whatever is left is written off at death.
        {draft.csnType !== 'income_based' && ' The årsbelopp rises about 2 % a year.'} Your exact amount is on Mina sidor
        at csn.se.
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

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <MoneyField
            label="Amortering"
            hint="(per month)"
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
              Use the requirement: {formatMoney(Math.ceil(share), currency)}
            </button>
          )}
        </div>
        <MoneyField
          label="Home value"
          hint={others.some((x) => x.propertyValue) ? '(same home as your other part)' : '(for the amorteringskrav)'}
          currency={currency}
          value={draft.propertyValue ?? 0}
          onValueChange={(v) => onChange({ ...draft, propertyValue: v > 0 ? v : undefined })}
        />
      </div>
      <div>
        <div className="mb-1 text-[12.5px] font-medium text-ink-soft">Ränta</div>
        <SegmentedControl
          value={type}
          onChange={(rateType: MortgageRateType) => onChange({ ...draft, rateType })}
          options={[
            { value: 'variable', label: 'Rörlig (3 mån)' },
            { value: 'fixed', label: 'Bunden' },
          ]}
        />
        <p className="mt-1 text-[12px] text-muted">
          {type === 'variable'
            ? 'Follows the styrränta, usually within weeks. Extra amortering is free any time.'
            : 'Fixed until the villkorsändringsdag. Paying extra before then can cost ränteskillnadsersättning.'}
        </p>
      </div>
      {type === 'fixed' && (
        <DateField
          label="Bunden till"
          hint="(villkorsändringsdag, on your loan statement)"
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
  if (!req) return null;
  const ltv = `${Math.round(req.ltv * 100)} %`;
  if (req.percent === 0) {
    return (
      <Callout tone="success" title={`Belåningsgrad ${ltv}`}>
        At 50 % or less there is no amorteringskrav.
      </Callout>
    );
  }
  return (
    <Callout tone={req.short ? 'warning' : 'success'} title={`Belåningsgrad ${ltv}: amortise ${req.percent} % a year`}>
      That is {formatMoney(req.monthly, currency)} a month across your mortgages; you amortise{' '}
      {formatMoney(req.current, currency)}.{req.ltv > 0.9 && ' Above 90 % is more than the bolånetak allows for a new loan.'}{' '}
      Loans taken before June 2016 can be exempt.
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
  const { addDebt, updateDebt, removeDebt } = usePlanStore();
  const [draft, setDraft] = useState<Draft | null>(null);
  const openEdit = (id: string) => {
    const d = (plan.debts ?? []).find((x) => x.id === id);
    if (d) setDraft({ ...d });
  };
  const openNew = (kind?: DebtKind) => setDraft(blankLoan(kind, now));
  const close = () => setDraft(null);
  const save = () => {
    if (!draft) return;
    const next = finalize(draft);
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
