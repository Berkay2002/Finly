import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { FREQUENCIES, FREQUENCY_LABELS } from '@/engine/frequency';
import { formatMoney, formatPercent } from '@/engine/format';
import { toMonthly } from '@/engine/frequency';
import { INCOME_KINDS, incomeKindMeta } from '@/engine/taxonomy';
import { homeKommunCode } from '@/engine/home';
import { findKommun, kommunerFor } from '@/engine/tax/kommuner';
import { DEFAULT_TAX_PROFILE, isTaxYearStale, resolveTaxYear, withholdingForGross } from '@/engine/tax/sweden';
import type { Frequency, GrossIncome, IncomeKind, IncomeSource, Reliability } from '@/engine/types';
import { usePlanStore } from '@/store/planStore';
import { useCurrency, usePlan } from '@/store/selectors';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { MoneyField, SegmentedControl, SelectField, Switch, TextField, TogglePill } from '@/components/ui/fields';
import { Sheet } from '@/components/ui/Sheet';
import { ItemRow } from './ItemRow';

const freqOptions = FREQUENCIES.filter((f) => f !== 'once').map((f) => ({ value: f, label: FREQUENCY_LABELS[f] }));

type Draft = Omit<IncomeSource, 'id'> & { id?: string };
type EntryMode = 'net' | 'gross';

/** Only a regular salary goes through the monthly withholding table. */
const GROSS_KINDS: IncomeKind[] = ['salary'];

function blankDraft(reliability: Reliability): Draft {
  const kind: IncomeKind = reliability === 'reliable' ? 'salary' : 'freelance';
  return {
    name: incomeKindMeta(kind).label.replace(/ \(.*\)$/, ''),
    note: '',
    kind,
    amount: 0,
    frequency: 'monthly',
    reliability,
    includeInBaseline: true,
  };
}

/** A new before-tax entry, taxed where the household lives when the plan knows that. */
function blankGross(amount = 0, kommunCode?: string): GrossIncome {
  const year = resolveTaxYear().year;
  const kommun = findKommun(kommunCode, year);
  return {
    amount,
    taxYear: year,
    profile: { ...DEFAULT_TAX_PROFILE, kommunCode: kommun?.code, kommunalRate: kommun?.rate },
  };
}

/** Recompute `amount` (net) from the gross block unless the user has pinned a payslip figure. */
function withNet(draft: Draft, gross: GrossIncome, keepOverride = false): Draft {
  const g = keepOverride ? gross : { ...gross, netOverridden: false };
  if (g.netOverridden) return { ...draft, gross: g };
  return { ...draft, gross: g, amount: withholdingForGross(g, draft.frequency).netPerPeriod };
}

export function IncomeEditor({ autoOpenAdd = false }: { autoOpenAdd?: boolean }) {
  const plan = usePlan();
  const currency = useCurrency();
  const { addIncome, updateIncome, removeIncome } = usePlanStore();
  const [editing, setEditing] = useState<Draft | null>(null);

  useEffect(() => {
    if (autoOpenAdd) setEditing(blankDraft('reliable'));
  }, [autoOpenAdd]);

  const save = () => {
    if (!editing) return;
    if (editing.id) {
      const { id, ...patch } = editing;
      updateIncome(id, patch);
    } else {
      addIncome(editing);
    }
    setEditing(null);
  };

  const section = (reliability: Reliability) => {
    const items = plan.income.filter((i) => i.reliability === reliability);
    const title = reliability === 'reliable' ? 'Reliable income' : 'Variable income';
    const sub =
      reliability === 'reliable' ? 'Income you can count on, each month.' : 'Income that can vary from month to month.';
    return (
      <div>
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
            <p className="text-[12.5px] text-muted">{sub}</p>
          </div>
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => setEditing(blankDraft(reliability))}>
            Add income
          </Button>
        </div>
        <div className="space-y-2">
          {items.map((src) => (
            <ItemRow
              key={src.id}
              icon={reliability === 'reliable' ? 'account-salary' : 'card-income-change'}
              accent={reliability === 'reliable' ? 'blue' : 'green'}
              title={src.name}
              onClick={() => setEditing({ ...src })}
              meta={
                <>
                  {src.note && <span>{src.note}</span>}
                  {src.gross && (
                    <span className="tabular">
                      Net {formatMoney(src.amount, currency)}
                      {src.gross.netOverridden ? ' (from payslip)' : ''}
                    </span>
                  )}
                  {src.frequency !== 'monthly' && (
                    <span className="tabular">≈ {formatMoney(toMonthly(src.amount, src.frequency), currency)}/month</span>
                  )}
                  {!src.includeInBaseline && <Chip tone="orange">Not in baseline</Chip>}
                </>
              }
              fields={
                <>
                  <MoneyField
                    size="sm"
                    currency={currency}
                    value={src.gross ? src.gross.amount : src.amount}
                    onValueChange={(v) => {
                      if (src.gross) {
                        const { id, ...rest } = src;
                        updateIncome(id, withNet(rest, { ...src.gross, amount: v }));
                      } else {
                        updateIncome(src.id, { amount: v });
                      }
                    }}
                    className="min-w-0 flex-1 sm:w-36 sm:flex-none"
                    title={src.gross ? 'Gross (before tax)' : 'Net (after tax)'}
                  />
                  <SelectField
                    size="sm"
                    value={src.frequency}
                    onValueChange={(frequency: Frequency) => {
                      if (src.gross) {
                        const { id, ...rest } = src;
                        updateIncome(id, withNet({ ...rest, frequency }, src.gross));
                      } else {
                        updateIncome(src.id, { frequency });
                      }
                    }}
                    options={freqOptions}
                    className="w-32 shrink-0"
                  />
                </>
              }
              menu={[
                { label: 'Edit details', icon: Pencil, onSelect: () => setEditing({ ...src }) },
                { label: 'Remove', icon: Trash2, danger: true, onSelect: () => removeIncome(src.id) },
              ]}
            />
          ))}
          {items.length === 0 && (
            <button
              type="button"
              onClick={() => setEditing(blankDraft(reliability))}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-page/60 px-3 py-3 text-[13px] font-medium text-brand-700 hover:bg-brand-50"
            >
              <Plus size={14} /> Add {reliability === 'reliable' ? 'a reliable' : 'a variable'} income source
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {section('reliable')}
      {section('variable')}

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit income' : 'Add income'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!editing?.name.trim()}>
              {editing?.id ? 'Save' : 'Add income'}
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="space-y-4">
            <SelectField
              label="Type"
              value={editing.kind}
              onValueChange={(kind: IncomeKind) => {
                const meta = incomeKindMeta(kind);
                setEditing({
                  ...editing,
                  kind,
                  reliability: meta.reliability,
                  frequency: meta.frequency,
                  name: editing.id ? editing.name : meta.label.replace(/ \(.*\)$/, ''),
                  gross: GROSS_KINDS.includes(kind) ? editing.gross : undefined,
                });
              }}
              options={INCOME_KINDS.map((k) => ({ value: k.id, label: k.label }))}
            />
            <TextField label="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <TextField
              label="Note"
              hint="(optional)"
              placeholder="e.g. Main job, average of last year"
              value={editing.note ?? ''}
              onChange={(e) => setEditing({ ...editing, note: e.target.value })}
            />

            {GROSS_KINDS.includes(editing.kind) && (
              <div>
                <div className="mb-1 text-[12.5px] font-medium text-ink-soft">I know my salary</div>
                <SegmentedControl<EntryMode>
                  value={editing.gross ? 'gross' : 'net'}
                  onChange={(mode) => {
                    if (mode === 'net') setEditing({ ...editing, gross: undefined });
                    else setEditing(withNet(editing, blankGross(editing.amount, homeKommunCode(plan))));
                  }}
                  options={[
                    { value: 'net', label: 'After tax (net)' },
                    { value: 'gross', label: 'Before tax (gross)' },
                  ]}
                />
              </div>
            )}

            {editing.gross ? (
              <GrossFields draft={editing} gross={editing.gross} currency={currency} onChange={setEditing} />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <MoneyField
                  label="Amount"
                  currency={currency}
                  value={editing.amount}
                  onValueChange={(amount) => setEditing({ ...editing, amount })}
                />
                <SelectField
                  label="Frequency"
                  value={editing.frequency}
                  onValueChange={(frequency: Frequency) => setEditing({ ...editing, frequency })}
                  options={freqOptions}
                />
              </div>
            )}

            <div>
              <div className="mb-1 text-[12.5px] font-medium text-ink-soft">Reliability</div>
              <TogglePill
                size="md"
                value={editing.reliability}
                onChange={(reliability: Reliability) => setEditing({ ...editing, reliability })}
                options={[
                  { value: 'reliable', label: 'Reliable' },
                  { value: 'variable', label: 'Variable' },
                ]}
              />
              <p className="mt-1 text-[12px] text-muted">
                Reliable income is what your essential costs should ideally be covered by.
              </p>
            </div>
            <Switch
              checked={editing.includeInBaseline}
              onChange={(includeInBaseline) => setEditing({ ...editing, includeInBaseline })}
              label="Include in my baseline budget"
              description="Turn off to track this income without planning around it."
            />
          </div>
        )}
      </Sheet>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Gross salary fields (Swedish withholding)                            */
/* ------------------------------------------------------------------ */

const NATIONAL = '';

function GrossFields({
  draft,
  gross,
  currency,
  onChange,
}: {
  draft: Draft;
  gross: GrossIncome;
  currency: string;
  onChange: (d: Draft) => void;
}) {
  const year = resolveTaxYear(gross.taxYear);
  const kommunOptions = useMemo(
    () => [
      { value: NATIONAL, label: `Not sure (national average ${year.fallbackKommunalRate}%)` },
      ...kommunerFor(year.year).map((k) => ({ value: k.code, label: `${k.name} · ${k.rate.toFixed(2)}%` })),
    ],
    [year],
  );
  const w = withholdingForGross(gross, draft.frequency);
  const estimate = w.netPerPeriod;
  const stale = isTaxYearStale();

  const setGross = (patch: Partial<GrossIncome>, keepOverride = false) =>
    onChange(withNet(draft, { ...gross, ...patch }, keepOverride));
  const setProfile = (patch: Partial<GrossIncome['profile']>) =>
    setGross({ profile: { ...gross.profile, ...patch } });

  return (
    <div className="space-y-4 rounded-xl border border-line bg-page/60 p-3">
      <div className="grid grid-cols-2 gap-3">
        <MoneyField
          label="Gross salary"
          hint="before tax"
          currency={currency}
          value={gross.amount}
          onValueChange={(amount) => setGross({ amount })}
        />
        <SelectField
          label="Frequency"
          value={draft.frequency}
          onValueChange={(frequency: Frequency) => onChange(withNet({ ...draft, frequency }, gross))}
          options={freqOptions}
        />
      </div>

      <SelectField
        label="Kommun"
        hint="sets your municipal tax"
        value={gross.profile.kommunCode ?? NATIONAL}
        onValueChange={(code: string) => {
          const kommun = kommunerFor(year.year).find((k) => k.code === code);
          setProfile({ kommunCode: kommun?.code, kommunalRate: kommun?.rate });
        }}
        options={kommunOptions}
      />

      <Switch
        checked={gross.profile.churchMember}
        onChange={(churchMember) => setProfile({ churchMember })}
        label="Member of Svenska kyrkan"
        description="Adds the church fee to your withholding."
      />
      <Switch
        checked={gross.profile.over66}
        onChange={(over66) => setProfile({ over66 })}
        label="66 or older at the start of the year"
        description="Higher basic deduction and a different job tax credit."
      />

      <div className="rounded-lg border border-line bg-card px-3 py-2.5 text-[12.5px]">
        <div className="flex items-baseline justify-between">
          <span className="text-muted">Estimated tax</span>
          <span className="tabular font-medium text-ink">
            {formatMoney(w.tax, currency)}/month · {formatPercent(w.effectiveRate, 1)}
          </span>
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-muted">Estimated net</span>
          <span className="tabular font-semibold text-ink">{formatMoney(estimate, currency)}</span>
        </div>
        <p className="mt-1.5 text-[11.5px] text-faint">
          Skattetabell {w.tableNumber}, kolumn {w.column}, {w.taxYear} rules
          {stale ? ` (no ${new Date().getFullYear()} rules loaded yet)` : ''}. Same as your employer's monthly
          withholding, so it does not matter which month you start.
        </p>
      </div>

      <div>
        <MoneyField
          label="Net you actually receive"
          hint={gross.netOverridden ? 'from your payslip' : 'estimate, adjust if your payslip differs'}
          currency={currency}
          value={draft.amount}
          onValueChange={(amount) => onChange({ ...draft, amount, gross: { ...gross, netOverridden: amount !== estimate } })}
        />
        {gross.netOverridden && (
          <button
            type="button"
            className="mt-1 text-[12px] font-medium text-brand-700 hover:underline"
            onClick={() => setGross({ netOverridden: false })}
          >
            Reset to estimate ({formatMoney(estimate, currency)})
          </button>
        )}
      </div>
    </div>
  );
}
