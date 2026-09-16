import { CloudDownload, Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { actualsHistory, suggestFromActuals } from '@/engine/actuals';
import { amountSpread, monthlySpread, varies } from '@/engine/amounts';
import {
  ENERGY_TAX_ORE,
  REDUCED_ENERGY_TAX_ORE,
  defaultTariff,
  energyTaxFor,
  impliedKwh,
  perKwh,
  tariffPartFor,
  withTariffAmounts,
} from '@/engine/electricity';
import { homeKommunCode, homePriceArea } from '@/engine/home';
import { findKommun } from '@/engine/tax/kommuner';
import {
  FREQUENCIES,
  FREQUENCY_LABELS,
  frequencyForOccurrences,
  isIrregular,
  monthlyToDaily,
  monthlyToWeekly,
} from '@/engine/frequency';
import { amountForMonthly } from '@/engine/food';
import { formatAmount, formatDate, formatMoney, formatMoneyRange, formatMonthKey } from '@/engine/format';
import {
  CATEGORY_META,
  groupsFor,
  isEverydaySpend,
  suggestionBySlug,
  suggestionsFor,
  type ExpenseSuggestion,
} from '@/engine/taxonomy';
import {
  EXPENSE_CATEGORIES,
  type ElectricityTariff,
  type ExpenseCategory,
  type ExpenseItem,
  type ExpenseTag,
  type Frequency,
  type Occurrences,
} from '@/engine/types';
import { fetchSpotAverage, previousMonthKey } from '@/lib/spotPrice';
import { HomeFields } from './HomeFields';
import { HouseholdFoodEstimator } from './HouseholdFood';
import { usePlanStore } from '@/store/planStore';
import { useCurrency, usePlan } from '@/store/selectors';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { CATEGORY_ICON } from '@/components/ui/icons';
import { CountField, DateField, MoneyField, SelectField, Switch, TextField, TogglePill } from '@/components/ui/fields';
import { Sheet } from '@/components/ui/Sheet';
import { ItemRow } from './ItemRow';

/** How often an item is paid: a frequency, or `each` for an item priced per purchase. */
type Cadence = Frequency | 'each';

const CADENCE_LABELS: Record<Cadence, string> = { each: 'Each time', ...FREQUENCY_LABELS };

const cadenceOf = (e: Pick<ExpenseItem, 'frequency' | 'occurrences'>): Cadence => (e.occurrences ? 'each' : e.frequency);

/** Everyday purchases only get the cadences that make sense for them; the current one is always kept. */
function cadenceOptions(e: Pick<ExpenseItem, 'subcategory' | 'frequency' | 'occurrences'>) {
  const list: Cadence[] = isEverydaySpend(e) ? ['each', 'weekly', 'monthly'] : [...FREQUENCIES, 'each'];
  const current = cadenceOf(e);
  if (!list.includes(current)) list.push(current);
  return list.map((c) => ({ value: c, label: CADENCE_LABELS[c] }));
}

/** Switching cadence keeps the amount as typed; it only changes what the amount means. */
function cadencePatch(e: Pick<ExpenseItem, 'subcategory' | 'occurrences'>, next: Cadence): Partial<ExpenseItem> {
  if (next !== 'each') return { frequency: next, occurrences: undefined };
  const occurrences = e.occurrences ?? suggestionBySlug(e.subcategory)?.occurrences ?? { times: 1, per: 'week' };
  return { occurrences, frequency: frequencyForOccurrences(occurrences), billingLag: undefined };
}

const occurrencesPatch = (occurrences: Occurrences): Partial<ExpenseItem> => ({
  occurrences,
  frequency: frequencyForOccurrences(occurrences),
});

const perOptions: { value: Occurrences['per']; label: string }[] = [
  { value: 'week', label: 'a week' },
  { value: 'month', label: 'a month' },
];

/** "× 5 a week" next to the price of one purchase. */
function TimesFields({
  value,
  onChange,
  disabled,
}: {
  value: Occurrences;
  onChange: (o: Occurrences) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span className="text-[12.5px] text-muted" aria-hidden>
        ×
      </span>
      <CountField
        size="sm"
        value={value.times}
        onValueChange={(times) => onChange({ ...value, times })}
        aria-label="Times"
        className="w-14"
        disabled={disabled}
      />
      <SelectField
        size="sm"
        value={value.per}
        onValueChange={(per) => onChange({ ...value, per })}
        options={perOptions}
        className="w-[6.5rem]"
        disabled={disabled}
      />
    </div>
  );
}

const lagOptions: { value: '0' | '1' | '2'; label: string }[] = [
  { value: '0', label: 'The same month' },
  { value: '1', label: 'The month before (paid a month later)' },
  { value: '2', label: 'Two months before' },
];

// Loans have their own model and page; the `debt` tag only survives on plans from before that.
const TAG_LABELS: Record<Exclude<ExpenseTag, 'debt'>, string> = {
  car: 'Car',
  subscription: 'Subscription',
  insurance: 'Insurance',
  utility: 'Utility',
  public_transport: 'Public transport',
};

export type ExpenseDraft = Omit<ExpenseItem, 'id'> & { id?: string };
type Draft = ExpenseDraft;

export function fromSuggestion(s: ExpenseSuggestion): Draft {
  return {
    name: s.name,
    category: s.category,
    subcategory: s.slug,
    amount: 0,
    frequency: s.frequency,
    occurrences: s.occurrences,
    fixed: s.fixed,
    essential: s.essential,
    committed: s.committed,
    tags: s.tags ?? [],
    billingLag: s.billingLag,
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
    const spread = monthlySpread(e);
    const monthly = spread.typical;
    const ranged = varies(e);
    const notMonthly = !!e.occurrences || e.frequency !== 'monthly';
    const suggestion = suggestFromActuals(e);
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
            {e.tariff && !e.includedElsewhere && <span className="tabular">{formatAmount(e.tariff.kwh)} kWh/month</span>}
            {notMonthly && monthly > 0 && !e.includedElsewhere && (
              <span className="tabular">≈ {formatMoney(monthly, currency)}/month</span>
            )}
            {ranged && !e.includedElsewhere && (
              <span className="tabular">
                varies {formatMoneyRange(spread.low, spread.high, currency)}
                {notMonthly ? '/month' : ''}
              </span>
            )}
            {isIrregular(e.frequency) && e.nextDate && <span>next {formatDate(e.nextDate)}</span>}
            {e.includedElsewhere && <Chip tone="neutral">Included elsewhere</Chip>}
            {suggestion && <Chip tone="orange">Estimate outdated</Chip>}
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
              placeholder={ranged && e.amount === 0 ? String(Math.round(amountSpread(e).typical)) : undefined}
              title={
                e.tariff
                  ? 'Calculated from usage and prices'
                  : e.occurrences
                    ? 'Price each time'
                    : ranged
                      ? 'Typical amount'
                      : undefined
              }
              onValueChange={(amount) => updateExpense(e.id, { amount })}
              className={clsx('min-w-0 flex-1 sm:flex-none', e.occurrences ? 'sm:w-28' : 'sm:w-36')}
              disabled={e.includedElsewhere || !!e.tariff}
            />
            <SelectField
              size="sm"
              value={cadenceOf(e)}
              onValueChange={(c: Cadence) => updateExpense(e.id, cadencePatch(e, c))}
              options={cadenceOptions(e)}
              // On a phone a per-purchase row has no room for it; the edit sheet still switches cadence.
              className={clsx('shrink-0', e.occurrences ? 'hidden w-28 sm:block' : 'w-32')}
              disabled={e.includedElsewhere || !!e.tariff}
            />
            {e.occurrences && (
              <TimesFields
                value={e.occurrences}
                onChange={(o) => updateExpense(e.id, occurrencesPatch(o))}
                disabled={e.includedElsewhere}
              />
            )}
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
  const setRange = (patch: Partial<NonNullable<Draft['range']>>) => {
    const next = { low: draft.range?.low ?? 0, high: draft.range?.high ?? 0, ...patch };
    set({ range: next.low > 0 || next.high > 0 ? next : undefined });
  };
  const plan = usePlan();
  const spread = amountSpread(draft);
  const hasRange = !draft.fixed && spread.high > spread.low;
  const everyday = isEverydaySpend(draft);
  const perPurchaseHint = suggestionBySlug(draft.subcategory)?.hint;
  const monthly = monthlySpread(draft).typical;
  const [estimating, setEstimating] = useState(false);
  const tariffPart = tariffPartFor(draft.subcategory);
  const setTariff = (tariff: ElectricityTariff | undefined) => onChange(withTariffAmounts({ ...draft, tariff }));
  const startTariff = () => {
    if (!tariffPart) return;
    const sibling = plan.expenses.find((x) => x.tariff && x.id !== draft.id)?.tariff;
    setTariff(defaultTariff(tariffPart, { sibling, kommunCode: homeKommunCode(plan) }));
  };
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
        <MoneyField
          label={
            draft.tariff
              ? 'Calculated amount'
              : draft.occurrences
                ? draft.fixed
                  ? 'Price each time'
                  : 'Typical price'
                : draft.fixed
                  ? 'Amount'
                  : 'Typical amount'
          }
          hint={
            draft.tariff
              ? '(average month)'
              : draft.occurrences && perPurchaseHint
                ? `(${perPurchaseHint.toLowerCase()})`
                : !draft.fixed && hasRange
                  ? '(what you budget for)'
                  : undefined
          }
          currency={currency}
          value={draft.tariff ? spread.typical : draft.amount}
          placeholder={hasRange && draft.amount === 0 ? String(Math.round(spread.typical)) : undefined}
          onValueChange={(amount) => set({ amount })}
          disabled={!!draft.tariff}
        />
        <SelectField
          label="How often"
          value={cadenceOf(draft)}
          onValueChange={(c: Cadence) => set(cadencePatch(draft, c))}
          options={cadenceOptions(draft)}
          disabled={!!draft.tariff}
        />
      </div>
      {draft.occurrences && (
        <div className="grid grid-cols-2 gap-3">
          <CountField
            label="Times"
            value={draft.occurrences.times}
            onValueChange={(times) => set(occurrencesPatch({ ...draft.occurrences!, times }))}
          />
          <SelectField
            label="Per"
            value={draft.occurrences.per}
            onValueChange={(per) => set(occurrencesPatch({ ...draft.occurrences!, per }))}
            options={[
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
          />
        </div>
      )}
      {draft.subcategory === 'groceries' && (
        <div className="rounded-xl border border-line bg-page/40 p-3">
          {estimating ? (
            <HouseholdFoodEstimator
              currency={currency}
              applyLabel={(m) => `Use ${formatMoney(amountForMonthly(draft, m), currency)} ${cadenceNoun(draft)}`}
              onApply={(m) => {
                set({ amount: amountForMonthly(draft, m) });
                setEstimating(false);
              }}
              onCancel={() => setEstimating(false)}
            />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 flex-1 text-[12.5px] text-muted">Not sure? Start from what a household like yours needs.</p>
              <Button size="sm" variant="soft" onClick={() => setEstimating(true)}>
                Estimate from household
              </Button>
            </div>
          )}
        </div>
      )}
      {!draft.fixed && (
        <div className="rounded-xl border border-dashed border-line bg-page/40 p-3">
          {tariffPart && (
            <Switch
              checked={!!draft.tariff}
              onChange={(on) => (on ? startTariff() : setTariff(undefined))}
              label="Calculate from usage and prices"
              description={
                tariffPart === 'supply'
                  ? 'kWh × (spot price + påslag) + månadsavgift'
                  : 'kWh × (överföring + energiskatt) + abonnemang'
              }
            />
          )}
          {draft.tariff ? (
            <TariffFields tariff={draft.tariff} onChange={setTariff} currency={currency} />
          ) : (
            <>
              <div className={clsx('mb-2 text-[12.5px] font-medium text-ink-soft', tariffPart && 'mt-3')}>
                Usual range
                <span className="ml-1 font-normal text-faint">
                  ({draft.occurrences ? 'each time' : `per ${periodNoun(draft.frequency)}`}, optional)
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MoneyField
                  label="Cheapest"
                  currency={currency}
                  value={draft.range?.low ?? 0}
                  onValueChange={(low) => setRange({ low })}
                />
                <MoneyField
                  label="Most expensive"
                  currency={currency}
                  value={draft.range?.high ?? 0}
                  onValueChange={(high) => setRange({ high })}
                />
              </div>
              <p className="mt-2 text-[12px] text-muted">
                {hasRange
                  ? draft.occurrences
                    ? `Budgets for ${formatMoney(spread.typical, currency)} each time; usually between ${formatMoneyRange(spread.low, spread.high, currency)}.`
                    : `Budgets for ${formatMoney(spread.typical, currency)}; a normal ${periodNoun(draft.frequency)} lands between ${formatMoneyRange(spread.low, spread.high, currency)}.`
                  : everyday
                    ? draft.occurrences
                      ? 'For a price that differs from one time to the next. Leave the typical price empty to budget for the midpoint.'
                      : `For costs that move from ${periodNoun(draft.frequency)} to ${periodNoun(draft.frequency)}, like the grocery shop. Leave the typical amount empty to budget for the midpoint.`
                    : 'For bills on a floating tariff, like electricity on rörligt pris. Leave the typical amount empty to budget for the midpoint.'}
              </p>
            </>
          )}
          <RecordedBills
            draft={draft}
            currency={currency}
            onApply={(s) => set({ amount: s.typical, range: { low: s.low, high: s.high } })}
            onUseKwh={(kwh) => draft.tariff && setTariff({ ...draft.tariff, kwh })}
          />
          {draft.frequency === 'monthly' && !everyday && (
            <SelectField
              label="The bill covers"
              hint="(so we ask for the right month)"
              className="mt-3"
              value={String(Math.min(2, Math.max(0, draft.billingLag ?? 0))) as '0' | '1' | '2'}
              onValueChange={(v) => set({ billingLag: Number(v) || undefined })}
              options={lagOptions}
            />
          )}
        </div>
      )}
      {draft.frequency !== 'monthly' && draft.frequency !== 'weekly' && (
        <DateField
          label={draft.frequency === 'once' ? 'Expected date' : 'Next due date'}
          hint="(used for upcoming expenses)"
          value={draft.nextDate ?? ''}
          onChange={(e) => set({ nextDate: e.target.value || undefined })}
        />
      )}
      {(draft.frequency !== 'monthly' || draft.occurrences || everyday) && monthly > 0 && !draft.tariff && (
        <p className="tabular -mt-2 text-[12px] text-muted">
          ≈ {formatMoney(monthly, currency)} a month
          {everyday && ` · ${formatMoney(monthlyToWeekly(monthly), currency)} a week · ${formatMoney(monthlyToDaily(monthly), currency)} a day`}
        </p>
      )}

      <div className="rounded-xl border border-line bg-page/60 p-3">
        <div className="mb-2 text-[12.5px] font-medium text-ink-soft">How would you describe this cost?</div>
        <div className="space-y-2.5">
          <ClassificationRow
            label="Amount"
            help="Does it cost the same each time?"
            value={draft.fixed ? 'fixed' : 'variable'}
            onChange={(v) =>
              v === 'fixed'
                ? set({ fixed: true, range: undefined, billingLag: undefined, tariff: undefined })
                : set({ fixed: false })
            }
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
          {(Object.keys(TAG_LABELS) as (keyof typeof TAG_LABELS)[]).map((t) => (
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

/**
 * The bills recorded for a variable item and, once there are enough, the estimate they imply.
 * Lives inside the edit sheet so the suggestion is one tap from the fields it would change.
 */
function RecordedBills({
  draft,
  currency,
  onApply,
  onUseKwh,
}: {
  draft: Draft;
  currency: string;
  onApply: (s: { typical: number; low: number; high: number }) => void;
  onUseKwh: (kwh: number) => void;
}) {
  const history = actualsHistory(draft);
  if (!history) return null;
  const suggestion = suggestFromActuals(draft);
  const recent = history.entries.slice(0, 6);
  const usage = draft.tariff ? usageFromBills(draft.tariff, history.entries) : null;
  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="mb-1.5 flex items-center justify-between text-[12px]">
        <span className="font-medium text-ink-soft">
          Recorded bills
          <span className="ml-1 font-normal text-faint">({history.count})</span>
        </span>
        <span className="tabular text-muted">
          avg {formatMoney(history.average, currency)} · {formatMoneyRange(history.min, history.max, currency)}
        </span>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {recent.map((x) => (
          <li key={x.month} className="tabular rounded-md bg-page px-2 py-1 text-[11.5px] text-ink-soft">
            {formatMonthKey(x.month)}: <span className="font-medium text-ink">{formatMoney(x.amount, currency)}</span>
          </li>
        ))}
        {history.count > recent.length && (
          <li className="rounded-md px-1 py-1 text-[11.5px] text-faint">+{history.count - recent.length} more</li>
        )}
      </ul>
      {suggestion && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-orange-100/70 px-3 py-2 text-[12px] text-orange-800">
          <Sparkles size={14} className="shrink-0 text-orange-500" />
          <span className="min-w-0 flex-1">
            Your last {suggestion.basedOn} bills say <span className="tabular font-semibold">{formatMoney(suggestion.typical, currency)}</span> typical,{' '}
            <span className="tabular font-semibold">{formatMoneyRange(suggestion.low, suggestion.high, currency)}</span>.
          </span>
          <Button size="sm" variant="soft" onClick={() => onApply(suggestion)}>
            Use these
          </Button>
        </div>
      )}
      {usage && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-orange-100/70 px-3 py-2 text-[12px] text-orange-800">
          <Sparkles size={14} className="shrink-0 text-orange-500" />
          <span className="min-w-0 flex-1">
            At these prices your last {usage.basedOn} bills mean about{' '}
            <span className="tabular font-semibold">{formatAmount(usage.kwh)} kWh</span> a month.
          </span>
          <Button size="sm" variant="soft" onClick={() => onUseKwh(usage.kwh)}>
            Use {formatAmount(usage.kwh)} kWh
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Usage implied by the average of the recent bills, when there are enough of them and it differs
 * noticeably from the usage on file.
 */
function usageFromBills(tariff: ElectricityTariff, entries: { amount: number }[]) {
  const recent = entries.slice(0, 12);
  if (recent.length < 3) return null;
  const average = recent.reduce((a, b) => a + b.amount, 0) / recent.length;
  const kwh = impliedKwh(tariff, average);
  if (kwh === null || Math.abs(kwh - tariff.kwh) <= Math.max(20, tariff.kwh * 0.1)) return null;
  return { kwh, basedOn: recent.length };
}

const formatOre = (ore: number) => String(Math.round(ore * 10) / 10);

/** Usage and price inputs for a calculated electricity bill, with the arithmetic shown underneath. */
function TariffFields({
  tariff,
  onChange,
  currency,
}: {
  tariff: ElectricityTariff;
  onChange: (t: ElectricityTariff) => void;
  currency: string;
}) {
  const plan = usePlan();
  const set = (patch: Partial<ElectricityTariff>) => onChange({ ...tariff, ...patch });
  const supply = tariff.part === 'supply';
  const optional = (n: number) => (n > 0 ? n : undefined);
  const kommunCode = homeKommunCode(plan);
  const kommun = findKommun(kommunCode, new Date().getFullYear());
  const expectedTax = energyTaxFor(kommunCode);
  return (
    <div className="mt-3 space-y-3">
      <div>
        <div className="mb-2 text-[12.5px] font-medium text-ink-soft">
          Where you live
        </div>
        <HomeFields compact />
      </div>

      <div>
        <div className="mb-2 text-[12.5px] font-medium text-ink-soft">
          Usage
          <span className="ml-1 font-normal text-faint">(shared with your other electricity bill)</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <MoneyField
            label="Per year"
            currency="kWh"
            value={Math.round(tariff.kwh * 12)}
            onValueChange={(year) => set({ kwh: year / 12 })}
          />
          <MoneyField
            label="Light month"
            currency="kWh"
            value={tariff.kwhLow ?? 0}
            onValueChange={(n) => set({ kwhLow: optional(n) })}
          />
          <MoneyField
            label="Heavy month"
            currency="kWh"
            value={tariff.kwhHigh ?? 0}
            onValueChange={(n) => set({ kwhHigh: optional(n) })}
          />
        </div>
        <p className="mt-1.5 text-[12px] text-muted">
          {tariff.kwh > 0 ? `${formatAmount(tariff.kwh)} kWh in an average month. ` : ''}
          Your grid company shows the yearly figure as "Årsförbrukning" or "Estimated annual consumption".
        </p>
      </div>

      <div>
        <div className="mb-2 text-[12.5px] font-medium text-ink-soft">
          {supply ? 'Your electricity deal' : 'Your grid tariff'}
          <span className="ml-1 font-normal text-faint">(incl. moms)</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MoneyField
            label={supply ? 'Spot price' : 'Överföringsavgift'}
            currency="öre/kWh"
            inputClassName="pr-20!"
            value={tariff.energyPrice}
            onValueChange={(energyPrice) => set({ energyPrice, priceMonth: undefined })}
          />
          <MoneyField
            label={supply ? 'Påslag' : 'Energiskatt'}
            currency="öre/kWh"
            inputClassName="pr-20!"
            value={tariff.surcharge}
            onValueChange={(surcharge) => set({ surcharge })}
          />
          <MoneyField
            label={supply ? 'Månadsavgift' : 'Abonnemang'}
            hint={supply ? undefined : '(+ effektavgift)'}
            currency={`${currency}/mo`}
            inputClassName="pr-20!"
            value={tariff.monthlyFee}
            onValueChange={(monthlyFee) => set({ monthlyFee })}
          />
        </div>
        {supply ? (
          <SpotPriceFetch tariff={tariff} onChange={onChange} />
        ) : (
          <p className="mt-2 text-[12px] text-muted">
            {kommun
              ? `Energiskatt in ${kommun.name} is ${expectedTax} öre/kWh in 2026${expectedTax === REDUCED_ENERGY_TAX_ORE ? ', with the northern Sweden deduction' : ''}.`
              : `Energiskatt is ${ENERGY_TAX_ORE} öre/kWh in 2026, ${REDUCED_ENERGY_TAX_ORE} öre in Norrbotten, Västerbotten, Jämtland and a few kommuner nearby.`}
            {kommun && tariff.surcharge !== expectedTax && (
              <>
                {' '}
                <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => set({ surcharge: expectedTax })}>
                  Use {expectedTax} öre
                </button>
              </>
            )}
          </p>
        )}
      </div>

      <TariffBreakdown tariff={tariff} currency={currency} />
    </div>
  );
}

/**
 * Fills the spot price with last month's average for the chosen price area. Only runs on a tap, and
 * offers nothing to fetch when the plan already holds that month's figure; lib/spotPrice.ts caches
 * the rest.
 */
function SpotPriceFetch({ tariff, onChange }: { tariff: ElectricityTariff; onChange: (t: ElectricityTariff) => void }) {
  const month = previousMonthKey();
  const { area } = homePriceArea(usePlan());
  const [state, setState] = useState<{ loading: boolean; error?: string }>({ loading: false });
  const current = tariff.priceMonth === month && tariff.priceArea === area;

  const load = async () => {
    setState({ loading: true });
    try {
      const avg = await fetchSpotAverage(area, month);
      onChange({ ...tariff, priceArea: area, energyPrice: avg.oreInclVat, priceMonth: month });
      setState({ loading: false });
    } catch (err) {
      setState({ loading: false, error: err instanceof Error ? err.message : 'Could not load spot prices.' });
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-muted">
      {current ? (
        <span>
          {formatMonthKey(month)} average for {area}, incl. moms.
        </span>
      ) : (
        <>
          <Button size="sm" variant="soft" icon={CloudDownload} onClick={load} disabled={state.loading}>
            {state.loading ? 'Loading…' : `Use ${formatMonthKey(month)} average`}
          </Button>
          {tariff.priceMonth && (
            <span>
              Now using the {formatMonthKey(tariff.priceMonth)} average for {tariff.priceArea}.
            </span>
          )}
        </>
      )}
      {state.error && <span className="text-red-500">{state.error}</span>}
      <span className="w-full text-faint">Spot prices from elprisetjustnu.se. Add your supplier's påslag on top.</span>
    </div>
  );
}

function TariffBreakdown({ tariff, currency }: { tariff: ElectricityTariff; currency: string }) {
  const s = amountSpread({ amount: 0, frequency: 'monthly', tariff });
  if (s.typical <= 0) {
    return <p className="text-[12px] text-muted">Enter your usage and prices to calculate the bill.</p>;
  }
  return (
    <p className="tabular rounded-lg bg-card px-3 py-2 text-[12px] text-muted">
      {formatAmount(tariff.kwh)} kWh × {formatOre(perKwh(tariff) * 100)} öre + {formatMoney(tariff.monthlyFee, currency)} ={' '}
      <span className="font-semibold text-ink">{formatMoney(s.typical, currency)}</span> in an average month
      {s.high > s.low && <>, {formatMoneyRange(s.low, s.high, currency)} from light to heavy months</>}.
    </p>
  );
}

/** "a week", "each time"… for the amount an item is entered in. */
function cadenceNoun(e: Pick<ExpenseItem, 'frequency' | 'occurrences'>): string {
  if (e.occurrences) return 'each time';
  return e.frequency === 'once' ? 'once' : `a ${periodNoun(e.frequency)}`;
}

function periodNoun(f: Frequency): string {
  switch (f) {
    case 'weekly':
      return 'week';
    case 'monthly':
      return 'month';
    case 'quarterly':
      return 'quarter';
    case 'yearly':
      return 'year';
    case 'once':
      return 'occurrence';
  }
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
