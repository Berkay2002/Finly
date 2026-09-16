import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FREQUENCIES, FREQUENCY_LABELS } from '@/engine/frequency';
import { formatMoney } from '@/engine/format';
import { toMonthly } from '@/engine/frequency';
import { INCOME_KINDS, incomeKindMeta } from '@/engine/taxonomy';
import type { Frequency, IncomeKind, IncomeSource, Reliability } from '@/engine/types';
import { usePlanStore } from '@/store/planStore';
import { useCurrency, usePlan } from '@/store/selectors';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { MoneyField, SelectField, Switch, TextField, TogglePill } from '@/components/ui/fields';
import { Sheet } from '@/components/ui/Sheet';
import { ItemRow } from './ItemRow';

const freqOptions = FREQUENCIES.filter((f) => f !== 'once').map((f) => ({ value: f, label: FREQUENCY_LABELS[f] }));

type Draft = Omit<IncomeSource, 'id'> & { id?: string };

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
                    value={src.amount}
                    onValueChange={(amount) => updateIncome(src.id, { amount })}
                    className="min-w-0 flex-1 sm:w-36 sm:flex-none"
                  />
                  <SelectField
                    size="sm"
                    value={src.frequency}
                    onValueChange={(frequency: Frequency) => updateIncome(src.id, { frequency })}
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
