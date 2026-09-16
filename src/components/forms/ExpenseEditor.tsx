import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { FREQUENCIES, FREQUENCY_LABELS, isIrregular, toMonthly } from '@/engine/frequency';
import { formatDate, formatMoney } from '@/engine/format';
import { CATEGORY_META, groupsFor, suggestionBySlug, suggestionsFor, type ExpenseSuggestion } from '@/engine/taxonomy';
import { EXPENSE_CATEGORIES, type ExpenseCategory, type ExpenseItem, type ExpenseTag, type Frequency } from '@/engine/types';
import { usePlanStore } from '@/store/planStore';
import { useCurrency, usePlan } from '@/store/selectors';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { CATEGORY_ICON } from '@/components/ui/icons';
import { DateField, MoneyField, SelectField, Switch, TextField, TogglePill } from '@/components/ui/fields';
import { Sheet } from '@/components/ui/Sheet';
import { ItemRow } from './ItemRow';

const freqOptions = FREQUENCIES.map((f) => ({ value: f, label: FREQUENCY_LABELS[f] }));

const TAG_LABELS: Record<ExpenseTag, string> = {
  car: 'Car',
  subscription: 'Subscription',
  debt: 'Debt repayment',
  insurance: 'Insurance',
  utility: 'Utility',
  public_transport: 'Public transport',
};

export type ExpenseDraft = Omit<ExpenseItem, 'id'> & { id?: string };
type Draft = ExpenseDraft;

function fromSuggestion(s: ExpenseSuggestion): Draft {
  return {
    name: s.name,
    category: s.category,
    subcategory: s.slug,
    amount: 0,
    frequency: s.frequency,
    fixed: s.fixed,
    essential: s.essential,
    committed: s.committed,
    tags: s.tags ?? [],
  };
}

export function customDraft(category: ExpenseCategory, name = '', tags: ExpenseTag[] = []): Draft {
  return {
    name,
    category,
    subcategory: 'custom',
    amount: 0,
    frequency: 'monthly',
    fixed: true,
    essential: category !== 'leisure' && category !== 'planned',
    committed: category !== 'leisure' && category !== 'planned',
    tags,
  };
}

export function ExpenseEditor({
  category,
  autoOpenAdd = false,
  showGroups = true,
}: {
  category: ExpenseCategory;
  autoOpenAdd?: boolean;
  showGroups?: boolean;
}) {
  const plan = usePlan();
  const currency = useCurrency();
  const { addExpense, updateExpense, removeExpense } = usePlanStore();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Draft | null>(null);

  useEffect(() => {
    if (autoOpenAdd) setAdding(true);
  }, [autoOpenAdd]);

  const items = plan.expenses.filter((e) => e.category === category);
  const groups = groupsFor(category);
  const Icon = CATEGORY_ICON[category];
  const accent = CATEGORY_META[category].accent;

  const grouped = useMemo(() => {
    const map = new Map<string, ExpenseItem[]>();
    for (const g of groups) map.set(g, []);
    map.set('Other', []);
    for (const e of items) {
      const g = suggestionBySlug(e.subcategory)?.group ?? 'Other';
      (map.get(g) ?? map.get('Other')!).push(e);
    }
    return [...map.entries()].filter(([, list]) => list.length > 0);
  }, [items, groups]);

  const quickAdd = (s: ExpenseSuggestion) => {
    addExpense(fromSuggestion(s));
  };

  const saveEdit = () => {
    if (!editing) return;
    if (editing.id) {
      const { id, ...patch } = editing;
      updateExpense(id, patch);
    } else {
      addExpense(editing);
    }
    setEditing(null);
  };

  const row = (e: ExpenseItem) => {
    const monthly = toMonthly(e.amount, e.frequency);
    return (
      <ItemRow
        key={e.id}
        icon={Icon}
        accent={accent}
        title={e.name}
        onClick={() => setEditing({ ...e })}
        className={clsx(e.includedElsewhere && 'opacity-60')}
        meta={
          <>
            {e.note && <span>{e.note}</span>}
            {e.frequency !== 'monthly' && e.amount > 0 && !e.includedElsewhere && (
              <span className="tabular">≈ {formatMoney(monthly, currency)}/month</span>
            )}
            {isIrregular(e.frequency) && e.nextDate && <span>next {formatDate(e.nextDate)}</span>}
            {e.includedElsewhere && <Chip tone="neutral">Included elsewhere</Chip>}
            {!e.essential && <Chip tone="purple">Optional</Chip>}
            {!e.committed && <Chip tone="blue">Flexible</Chip>}
          </>
        }
        fields={
          <>
            <MoneyField
              size="sm"
              currency={currency}
              value={e.amount}
              onValueChange={(amount) => updateExpense(e.id, { amount })}
              className="min-w-0 flex-1 sm:w-36 sm:flex-none"
              disabled={e.includedElsewhere}
            />
            <SelectField
              size="sm"
              value={e.frequency}
              onValueChange={(frequency: Frequency) => updateExpense(e.id, { frequency })}
              options={freqOptions}
              className="w-32 shrink-0"
              disabled={e.includedElsewhere}
            />
          </>
        }
        menu={[
          { label: 'Edit details', icon: Pencil, onSelect: () => setEditing({ ...e }) },
          { label: 'Remove', icon: Trash2, danger: true, onSelect: () => removeExpense(e.id) },
        ]}
      />
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-muted">
          {items.length === 0 ? 'Nothing added yet.' : `${items.length} item${items.length === 1 ? '' : 's'}`}
        </p>
        <Button variant="secondary" size="sm" icon={Plus} onClick={() => setAdding(true)}>
          Add expense
        </Button>
      </div>

      {items.length === 0 && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-page/60 px-3 py-5 text-[13px] font-medium text-brand-700 hover:bg-brand-50"
        >
          <Plus size={14} /> Add your first {CATEGORY_META[category].shortLabel.toLowerCase()} expense
        </button>
      )}

      {showGroups
        ? grouped.map(([group, list]) => (
            <div key={group}>
              <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-faint">{group}</h3>
              <div className="space-y-2">{list.map(row)}</div>
            </div>
          ))
        : items.length > 0 && <div className="space-y-2">{items.map(row)}</div>}

      <AddExpenseSheet
        open={adding}
        category={category}
        existing={items}
        onClose={() => setAdding(false)}
        onPick={quickAdd}
        onCustom={(name) => {
          setAdding(false);
          setEditing(customDraft(category, name));
        }}
      />

      <ExpenseSheet draft={editing} onChange={setEditing} onClose={() => setEditing(null)} onSave={saveEdit} />
    </div>
  );
}

/**
 * The add/edit expense dialog on its own, so pages other than the category sections
 * (Insights, for instance) can edit an expense in place without navigating away.
 * Pass `showCategory` when the draft was not created from a category page.
 */
export function ExpenseSheet({
  draft,
  onChange,
  onClose,
  onSave,
  onRemove,
  showCategory = false,
}: {
  draft: Draft | null;
  onChange: (d: Draft) => void;
  onClose: () => void;
  onSave: () => void;
  onRemove?: () => void;
  showCategory?: boolean;
}) {
  const currency = useCurrency();
  return (
    <Sheet
      open={draft !== null}
      onClose={onClose}
      title={draft?.id ? 'Edit expense' : 'New expense'}
      subtitle={draft && !showCategory ? CATEGORY_META[draft.category].label : undefined}
      footer={
        <div className="flex items-center gap-2">
          {onRemove && draft?.id && (
            <Button variant="ghost" icon={Trash2} onClick={onRemove} className="mr-auto text-red-500 hover:bg-red-100">
              Remove
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} className="ml-auto">
            Cancel
          </Button>
          <Button onClick={onSave} disabled={!draft?.name.trim()}>
            {draft?.id ? 'Save' : 'Add expense'}
          </Button>
        </div>
      }
    >
      {draft && <ExpenseDetailForm draft={draft} onChange={onChange} currency={currency} showCategory={showCategory} />}
    </Sheet>
  );
}

/**
 * Expense editing state plus the rendered sheet, for pages that list expenses across
 * categories (Home, Insights, Planning). Render `sheet` once anywhere in the page.
 */
export function useExpenseSheet({ showCategory = true }: { showCategory?: boolean } = {}) {
  const plan = usePlan();
  const { addExpense, updateExpense, removeExpense } = usePlanStore();
  const [draft, setDraft] = useState<Draft | null>(null);
  const openEdit = (id: string) => {
    const e = plan.expenses.find((x) => x.id === id);
    if (e) setDraft({ ...e });
  };
  const openNew = (d: Draft) => setDraft(d);
  const close = () => setDraft(null);
  const save = () => {
    if (!draft) return;
    if (draft.id) {
      const { id, ...patch } = draft;
      updateExpense(id, patch);
    } else addExpense(draft);
    setDraft(null);
  };
  const remove = () => {
    if (draft?.id) removeExpense(draft.id);
    setDraft(null);
  };
  const sheet = (
    <ExpenseSheet draft={draft} onChange={setDraft} onClose={close} onSave={save} onRemove={remove} showCategory={showCategory} />
  );
  return { draft, openEdit, openNew, close, sheet };
}

function ExpenseDetailForm({
  draft,
  onChange,
  currency,
  showCategory = false,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  currency: string;
  showCategory?: boolean;
}) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const toggleTag = (t: ExpenseTag) =>
    set({ tags: draft.tags.includes(t) ? draft.tags.filter((x) => x !== t) : [...draft.tags, t] });
  return (
    <div className="space-y-4">
      {showCategory && (
        <SelectField
          label="Category"
          hint="(which page it lives on)"
          value={draft.category}
          onValueChange={(category: ExpenseCategory) => set({ category })}
          options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_META[c].label }))}
        />
      )}
      <TextField label="Name" value={draft.name} onChange={(e) => set({ name: e.target.value })} autoFocus={!draft.id} />
      <TextField
        label="Note"
        hint="(optional)"
        placeholder="e.g. Includes water and heating"
        value={draft.note ?? ''}
        onChange={(e) => set({ note: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-3">
        <MoneyField label="Amount" currency={currency} value={draft.amount} onValueChange={(amount) => set({ amount })} />
        <SelectField
          label="Frequency"
          value={draft.frequency}
          onValueChange={(frequency: Frequency) => set({ frequency })}
          options={freqOptions}
        />
      </div>
      {draft.frequency !== 'monthly' && draft.frequency !== 'weekly' && (
        <DateField
          label={draft.frequency === 'once' ? 'Expected date' : 'Next due date'}
          hint="(used for upcoming expenses)"
          value={draft.nextDate ?? ''}
          onChange={(e) => set({ nextDate: e.target.value || undefined })}
        />
      )}
      {draft.frequency !== 'monthly' && draft.amount > 0 && (
        <p className="tabular -mt-2 text-[12px] text-muted">
          ≈ {formatMoney(toMonthly(draft.amount, draft.frequency), currency)} per month
        </p>
      )}

      <div className="rounded-xl border border-line bg-page/60 p-3">
        <div className="mb-2 text-[12.5px] font-medium text-ink-soft">How would you describe this cost?</div>
        <div className="space-y-2.5">
          <ClassificationRow
            label="Amount"
            help="Does it cost the same each time?"
            value={draft.fixed ? 'fixed' : 'variable'}
            onChange={(v) => set({ fixed: v === 'fixed' })}
            options={[
              { value: 'fixed', label: 'Fixed' },
              { value: 'variable', label: 'Variable' },
            ]}
          />
          <ClassificationRow
            label="Need"
            help="Is it required to keep your life running?"
            value={draft.essential ? 'essential' : 'optional'}
            onChange={(v) => set({ essential: v === 'essential' })}
            options={[
              { value: 'essential', label: 'Essential' },
              { value: 'optional', label: 'Optional' },
            ]}
          />
          <ClassificationRow
            label="Flexibility"
            help="Could you realistically change it soon?"
            value={draft.committed ? 'committed' : 'flexible'}
            onChange={(v) => set({ committed: v === 'committed' })}
            options={[
              { value: 'committed', label: 'Committed' },
              { value: 'flexible', label: 'Flexible' },
            ]}
          />
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-[12.5px] font-medium text-ink-soft">Tags</div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(TAG_LABELS) as ExpenseTag[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleTag(t)}
              className={clsx(
                'rounded-full border px-2.5 py-1 text-[12px] font-medium transition',
                draft.tags.includes(t)
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-line bg-card text-muted hover:text-ink',
              )}
            >
              {TAG_LABELS[t]}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[12px] text-muted">Tags power the car cost and subscription insights.</p>
      </div>

      <Switch
        checked={!!draft.includedElsewhere}
        onChange={(includedElsewhere) => set({ includedElsewhere })}
        label="Already included in another payment"
        description="e.g. water included in rent. Kept visible, excluded from totals."
      />
    </div>
  );
}

function ClassificationRow<T extends string>({
  label,
  help,
  value,
  onChange,
  options,
}: {
  label: string;
  help: string;
  value: T;
  onChange: (v: T) => void;
  options: [{ value: T; label: string }, { value: T; label: string }];
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink">{label}</div>
        <div className="text-[11.5px] text-muted">{help}</div>
      </div>
      <TogglePill value={value} onChange={onChange} options={options} />
    </div>
  );
}

function AddExpenseSheet({
  open,
  category,
  existing,
  onClose,
  onPick,
  onCustom,
}: {
  open: boolean;
  category: ExpenseCategory;
  existing: ExpenseItem[];
  onClose: () => void;
  onPick: (s: ExpenseSuggestion) => void;
  onCustom: (name: string) => void;
}) {
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const used = new Set(existing.map((e) => e.subcategory));
  const all = suggestionsFor(category);
  const q = query.trim().toLowerCase();
  const filtered = q ? all.filter((s) => s.name.toLowerCase().includes(q)) : all;
  const groups = groupsFor(category).filter((g) => filtered.some((s) => s.group === g));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Add ${CATEGORY_META[category].shortLabel.toLowerCase()} expense`}
      subtitle="Pick a common one, or create your own. You can add the same item twice."
    >
      <div className="relative mb-3">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && q && filtered.length === 0) onCustom(query.trim());
          }}
          placeholder="Search or type a custom name…"
          className="h-10 w-full rounded-xl border border-line bg-card pl-9 pr-3 text-[13.5px] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <button
        type="button"
        onClick={() => onCustom(query.trim())}
        className="mb-3 flex w-full items-center gap-2 rounded-xl border border-dashed border-brand-200 bg-brand-50/60 px-3 py-2.5 text-[13px] font-medium text-brand-700 hover:bg-brand-50"
      >
        <Plus size={14} />
        {q ? `Create "${query.trim()}"` : 'Create a custom expense'}
      </button>

      {groups.map((g) => (
        <div key={g} className="mb-3">
          <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-faint">{g}</div>
          <div className="flex flex-wrap gap-1.5">
            {filtered
              .filter((s) => s.group === g)
              .map((s) => {
                const added = used.has(s.slug);
                return (
                  <button
                    key={s.slug}
                    type="button"
                    onClick={() => {
                      onPick(s);
                      if (!q) return;
                      onClose();
                    }}
                    className={clsx(
                      'rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition',
                      added
                        ? 'border-brand-200 bg-brand-50 text-brand-700'
                        : 'border-line bg-card text-ink-soft hover:border-line-strong hover:text-ink',
                    )}
                  >
                    {added ? '✓ ' : '+ '}
                    {s.name}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
      {filtered.length === 0 && (
        <p className="py-4 text-center text-[13px] text-muted">No matches. Press Enter to create it.</p>
      )}
    </Sheet>
  );
}
