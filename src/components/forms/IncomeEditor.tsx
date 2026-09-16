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
import { useT } from '@/i18n';
import { usePlanStore } from '@/store/planStore';
import { useCurrency, usePlan } from '@/store/selectors';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { MoneyField, SegmentedControl, SelectField, Switch, TextField, TogglePill } from '@/components/ui/fields';
import { Sheet } from '@/components/ui/Sheet';
import { ItemRow } from './ItemRow';

const freqOptions = () => FREQUENCIES.filter((f) => f !== 'once').map((f) => ({ value: f, label: FREQUENCY_LABELS[f] }));

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
  const t = useT().income.editor;

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
    const title = reliability === 'reliable' ? t.reliableTitle : t.variableTitle;
    const sub = reliability === 'reliable' ? t.reliableSubtitle : t.variableSubtitle;
    return (
      <div>
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
            <p className="text-[12.5px] text-muted">{sub}</p>
          </div>
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => setEditing(blankDraft(reliability))}>
            {t.addIncome}
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
                      {t.net(formatMoney(src.amount, currency))}
                      {src.gross.netOverridden ? t.fromPayslip : ''}
                    </span>
                  )}
                  {src.frequency !== 'monthly' && (
                    <span className="tabular">{t.perMonthApprox(formatMoney(toMonthly(src.amount, src.frequency), currency))}</span>
                  )}
                  {!src.includeInBaseline && <Chip tone="orange">{t.notInBaseline}</Chip>}
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
                    title={src.gross ? t.grossTitle : t.netTitle}
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
                    options={freqOptions()}
                    className="w-32 shrink-0"
                  />
                </>
              }
              menu={[
                { label: t.editDetails, icon: Pencil, onSelect: () => setEditing({ ...src }) },
                { label: t.remove, icon: Trash2, danger: true, onSelect: () => removeIncome(src.id) },
              ]}
            />
          ))}
          {items.length === 0 && (
            <button
              type="button"
              onClick={() => setEditing(blankDraft(reliability))}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-page/60 px-3 py-3 text-[13px] font-medium text-brand-700 hover:bg-brand-50"
            >
              <Plus size={14} /> {reliability === 'reliable' ? t.addReliable : t.addVariable}
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
        title={editing?.id ? t.editIncome : t.addIncome}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {t.cancel}
            </Button>
            <Button onClick={save} disabled={!editing?.name.trim()}>
              {editing?.id ? t.save : t.addIncome}
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="space-y-4">
            <SelectField
              label={t.type}
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
            <TextField label={t.name} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <TextField
              label={t.note}
              hint={t.optional}
              placeholder={t.notePlaceholder}
              value={editing.note ?? ''}
              onChange={(e) => setEditing({ ...editing, note: e.target.value })}
            />

            {GROSS_KINDS.includes(editing.kind) && (
              <div>
                <div className="mb-1 text-[12.5px] font-medium text-ink-soft">{t.iKnowMySalary}</div>
                <SegmentedControl<EntryMode>
                  value={editing.gross ? 'gross' : 'net'}
                  onChange={(mode) => {
                    if (mode === 'net') setEditing({ ...editing, gross: undefined });
                    else setEditing(withNet(editing, blankGross(editing.amount, homeKommunCode(plan))));
                  }}
                  options={[
                    { value: 'net', label: t.afterTax },
                    { value: 'gross', label: t.beforeTax },
                  ]}
                />
              </div>
            )}

            {editing.gross ? (
              <GrossFields draft={editing} gross={editing.gross} currency={currency} onChange={setEditing} />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <MoneyField
                  label={t.amount}
                  currency={currency}
                  value={editing.amount}
                  onValueChange={(amount) => setEditing({ ...editing, amount })}
                />
                <SelectField
                  label={t.frequency}
                  value={editing.frequency}
                  onValueChange={(frequency: Frequency) => setEditing({ ...editing, frequency })}
                  options={freqOptions()}
                />
              </div>
            )}

            <div>
              <div className="mb-1 text-[12.5px] font-medium text-ink-soft">{t.reliability}</div>
              <TogglePill
                size="md"
                value={editing.reliability}
                onChange={(reliability: Reliability) => setEditing({ ...editing, reliability })}
                options={[
                  { value: 'reliable', label: t.reliable },
                  { value: 'variable', label: t.variable },
                ]}
              />
              <p className="mt-1 text-[12px] text-muted">
                {t.reliabilityHint}
              </p>
            </div>
            <Switch
              checked={editing.includeInBaseline}
              onChange={(includeInBaseline) => setEditing({ ...editing, includeInBaseline })}
              label={t.includeInBaseline}
              description={t.includeInBaselineHint}
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
  const t = useT().income.gross;
  const year = resolveTaxYear(gross.taxYear);
  const kommunOptions = useMemo(
    () => [
      { value: NATIONAL, label: t.notSure(formatPercent(year.fallbackKommunalRate / 100, 2)) },
      ...kommunerFor(year.year).map((k) => ({ value: k.code, label: t.kommunOption(k.name, formatPercent(k.rate / 100, 2)) })),
    ],
    [year, t],
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
          label={t.grossSalary}
          hint={t.beforeTax}
          currency={currency}
          value={gross.amount}
          onValueChange={(amount) => setGross({ amount })}
        />
        <SelectField
          label={t.frequency}
          value={draft.frequency}
          onValueChange={(frequency: Frequency) => onChange(withNet({ ...draft, frequency }, gross))}
          options={freqOptions()}
        />
      </div>

      <SelectField
        label={t.kommun}
        hint={t.kommunHint}
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
        label={t.church}
        description={t.churchHint}
      />
      <Switch
        checked={gross.profile.over66}
        onChange={(over66) => setProfile({ over66 })}
        label={t.over66}
        description={t.over66Hint}
      />

      <div className="rounded-lg border border-line bg-card px-3 py-2.5 text-[12.5px]">
        <div className="flex items-baseline justify-between">
          <span className="text-muted">{t.estimatedTax}</span>
          <span className="tabular font-medium text-ink">
            {t.taxPerMonth(formatMoney(w.tax, currency), formatPercent(w.effectiveRate, 1))}
          </span>
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-muted">{t.estimatedNet}</span>
          <span className="tabular font-semibold text-ink">{formatMoney(estimate, currency)}</span>
        </div>
        <p className="mt-1.5 text-[11.5px] text-faint">
          {t.tableNote(w.tableNumber, w.column, w.taxYear, stale ? new Date().getFullYear() : undefined)}
        </p>
      </div>

      <div>
        <MoneyField
          label={t.netReceived}
          hint={gross.netOverridden ? t.fromPayslip : t.estimateHint}
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
            {t.reset(formatMoney(estimate, currency))}
          </button>
        )}
      </div>
    </div>
  );
}
