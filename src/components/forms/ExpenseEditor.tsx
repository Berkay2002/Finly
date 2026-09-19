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
import { amountForMonthly } from '@/engine/everyday';
import { fxRate } from '@/engine/fx';
import { monthKeyOf } from '@/engine/metrics';
import { latestMonth } from '@/engine/foodPrices';
import { foodPriceLink } from '@/engine/priceLinks';
import { formatAmount, formatDate, formatMoney, formatMoneyRange, formatMonthKey, formatNumber } from '@/engine/format';
import {
  CATEGORY_META,
  expenseName,
  groupLabel,
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
import { locale, messages, useT } from '@/i18n';
import { brandedExpenseName } from '@/lib/brandLogo';
import { useFoodPrices } from '@/lib/foodPrices';
import { FX_CURRENCIES } from '@/lib/fx';
import { fetchSpotAverage, previousMonthKey } from '@/lib/spotPrice';
import { GroupBudget } from '@/components/everyday/EverydayCards';
import { HomeFields } from './HomeFields';
import { HouseholdFoodEstimator } from './HouseholdFood';
import { BrandPicker } from './BrandPicker';
import { usePlanStore } from '@/store/planStore';
import { useCurrency, usePlan } from '@/store/selectors';
import { closeTo, normalizeParty, personKey, personLabel } from '@/engine/bankActuals';
import { matchContact } from '@/engine/vcard';
import { useBankStore } from '@/bank/bankStore';
import { PASS_THROUGH_LABEL, passThroughBrand } from '@/engine/merchants';
import { Button } from '@/components/ui/Button';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { Chip } from '@/components/ui/Chip';
import { CATEGORY_ICON } from '@/components/ui/icons';
import { CountField, DateField, Label, MoneyField, SelectField, Switch, TextField, TogglePill } from '@/components/ui/fields';
import { Sheet } from '@/components/ui/Sheet';
import { ItemRow } from './ItemRow';

/** How often an item is paid: a frequency, or `each` for an item priced per purchase. */
type Cadence = Frequency | 'each';

const cadenceLabel = (c: Cadence): string => (c === 'each' ? messages().expenses.cadence.each : FREQUENCY_LABELS[c]);

const cadenceOf = (e: Pick<ExpenseItem, 'frequency' | 'occurrences'>): Cadence => (e.occurrences ? 'each' : e.frequency);

/** Everyday purchases only get the cadences that make sense for them; the current one is always kept. */
function cadenceOptions(e: Pick<ExpenseItem, 'subcategory' | 'frequency' | 'occurrences'>) {
  const list: Cadence[] = isEverydaySpend(e) ? ['each', 'weekly', 'monthly'] : [...FREQUENCIES, 'each'];
  const current = cadenceOf(e);
  if (!list.includes(current)) list.push(current);
  return list.map((c) => ({ value: c, label: cadenceLabel(c) }));
}

/** Switching cadence keeps the amount as typed; it only changes what the amount means. */
function cadencePatch(e: Pick<ExpenseItem, 'subcategory' | 'occurrences'>, next: Cadence): Partial<ExpenseItem> {
  if (next !== 'each') return { frequency: next, occurrences: undefined };
  const occurrences = e.occurrences ?? suggestionBySlug(e.subcategory)?.occurrences ?? { times: 1, per: 'week' };
  return { occurrences, frequency: frequencyForOccurrences(occurrences), billingLag: undefined, nextDate: undefined };
}

const occurrencesPatch = (occurrences: Occurrences): Partial<ExpenseItem> => ({
  occurrences,
  frequency: frequencyForOccurrences(occurrences),
});

const perOptions = (): { value: Occurrences['per']; label: string }[] => {
  const t = messages().expenses.perOptions;
  return [
    { value: 'week', label: t.week },
    { value: 'month', label: t.month },
    { value: 'year', label: t.year },
  ];
};

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
  const t = useT();
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span className="text-[12.5px] text-muted" aria-hidden>
        ×
      </span>
      <CountField
        size="sm"
        value={value.times}
        onValueChange={(times) => onChange({ ...value, times })}
        aria-label={t.expenses.row.times}
        className="w-14"
        disabled={disabled}
      />
      <SelectField
        size="sm"
        value={value.per}
        onValueChange={(per) => onChange({ ...value, per })}
        options={perOptions()}
        className="w-[6.5rem]"
        disabled={disabled}
      />
    </div>
  );
}

const lagOptions = (): { value: '0' | '1' | '2'; label: string }[] => {
  const t = messages().expenses.lagOptions;
  return [
    { value: '0', label: t.same },
    { value: '1', label: t.before },
    { value: '2', label: t.twoBefore },
  ];
};

// Loans have their own model and page; the `debt` tag only survives on plans from before that.
const TAG_IDS: Exclude<ExpenseTag, 'debt'>[] = ['car', 'subscription', 'insurance', 'utility', 'public_transport'];

/** The plan currency first, then the currencies Frankfurter has rates for; the current pick is always kept. */
function currencyOptions(planCurrency: string, current: string) {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale()], { type: 'currency' });
  } catch {
    // Old browser: codes alone.
  }
  const codes = [...new Set([planCurrency, current, ...FX_CURRENCIES])];
  return codes.map((c) => ({ value: c, label: names ? `${c} · ${names.of(c)}` : c }));
}

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

/** "Klarna" or "PayPal" when this item is paid through one of them. */
const isMobile = (key: string) => /^7\d{8}$/.test(key);
/** A sender name the bank writes in capitals, the way a person writes it. */
const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

/**
 * Who pays a share of this back, from those who have paid in before: by Swish number, or by the sender name
 * on a bank transfer. One person is one pill under both: a sender name the contacts on this device know is
 * folded onto their number, kept in the plan (`bank.people`) once picked; a name nobody knows is linked by
 * hand. Those who have sent about one share are offered; with no bank lines to pick from, a count does.
 */
function SharedWith({ draft, set }: { draft: Pick<ExpenseItem, 'amount' | 'sharedWith' | 'sharedBy'>; set: (patch: Partial<ExpenseItem>) => void }) {
  const tf = useT().expenses.form;
  const txs = useBankStore((s) => s.txs);
  const contacts = useBankStore((s) => s.contacts);
  const bank = usePlanStore((s) => s.plan.bank);
  const setBankSetup = usePlanStore((s) => s.setBankSetup);
  const people = bank?.people;
  const chosen = (draft.sharedBy ?? []).map((k) => people?.[k] ?? k);
  const { list, mobiles, labels, guesses } = useMemo(() => {
    const seen = new Map<string, { date: string; near: boolean; sender?: string }>();
    const guesses: Record<string, string> = {};
    for (const tx of Object.values(txs).flat()) {
      const raw = tx.amount > 0 && !tx.pending ? personKey(tx) : undefined;
      if (!raw) continue;
      const guess = !isMobile(raw) && !people?.[raw] ? matchContact(tx.counterparty, contacts) : undefined;
      if (guess) guesses[raw] = guess;
      const id = people?.[raw] ?? guess ?? raw;
      const p = seen.get(id) ?? { date: '', near: false };
      if (p.date < tx.date) p.date = tx.date;
      if (draft.amount > 0 && closeTo(tx.amount, draft.amount)) p.near = true;
      if (!isMobile(raw)) p.sender = titleCase(tx.counterparty ?? raw);
      seen.set(id, p);
    }
    const all = [...seen.entries()].sort((a, b) => b[1].date.localeCompare(a[1].date));
    const near = all.filter(([, p]) => p.near);
    const list = [...new Set([...chosen, ...(near.length ? near : all).map(([k]) => k)])];
    const labels = new Map(all.map(([k, p]) => [k, isMobile(k) ? (contacts[k] ?? p.sender ?? personLabel(k)) : (p.sender ?? k)]));
    return { list, mobiles: all.map(([k]) => k).filter(isMobile), labels, guesses };
  }, [txs, contacts, people, chosen, draft.amount]);
  if (!list.length) {
    return <CountField label={tf.sharedWith} hint={tf.sharedWithHint} min={0} value={draft.sharedWith ?? 0} onValueChange={(n) => set({ sharedWith: n > 0 ? Math.floor(n) : undefined })} />;
  }
  const name = (key: string) => labels.get(key) ?? (isMobile(key) ? personLabel(key, contacts) : key);
  const link = (links: Record<string, string>) => bank && Object.keys(links).length && setBankSetup({ ...bank, people: { ...people, ...links } });
  const choose = (next: string[]) => set({ sharedBy: next.length ? next : undefined, sharedWith: next.length || undefined });
  const toggle = (key: string) => {
    if (chosen.includes(key)) return choose(chosen.filter((k) => k !== key));
    link(Object.fromEntries(Object.entries(guesses).filter(([, id]) => id === key)));
    choose([...chosen, key]);
  };
  return (
    <div>
      <Label hint={tf.sharedByHint}>{tf.sharedBy}</Label>
      <div className="flex flex-wrap gap-1.5">
        {list.map((key) => {
          const on = chosen.includes(key);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(key)}
              className={clsx('rounded-full border px-3 py-1 text-[12.5px] transition', on ? 'border-brand-solid bg-brand-50 text-brand-700' : 'border-line text-muted hover:bg-page')}
            >
              {name(key)}
            </button>
          );
        })}
      </div>
      {chosen
        .filter((key) => !isMobile(key))
        .map((key) => (
          <SelectField
            key={key}
            size="sm"
            className="mt-2"
            label={tf.sharedBySwish(name(key))}
            value=""
            placeholder={tf.sharedByNone}
            options={mobiles.filter((m) => !chosen.includes(m)).map((m) => ({ value: m, label: name(m) }))}
            onValueChange={(mobile) => {
              link({ [key]: mobile });
              choose([...new Set(chosen.map((k) => (k === key ? mobile : k)))]);
            }}
          />
        ))}
    </div>
  );
}

function paidVia(e: Pick<ExpenseItem, 'bankMatch'>): string | undefined {
  const brand = passThroughBrand(normalizeParty(e.bankMatch?.counterparty));
  return brand && PASS_THROUGH_LABEL[brand];
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
  const t = useT();
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
    const itemCurrency = e.currency ?? currency;
    const rate = fxRate(plan.fx, itemCurrency, currency, monthKeyOf(new Date()));
    const suggestion = suggestFromActuals(e);
    const subscription = e.tags.includes('subscription');
    const brandDomain = subscription ? e.brandDomain : undefined;
    const brand = !brandDomain && subscription ? brandedExpenseName(e) : null;
    return (
      <ItemRow
        key={e.id}
        icon={Icon}
        accent={accent}
        brand={brand}
        brandDomain={brandDomain}
        title={expenseName(e)}
        onClick={() => setEditing({ ...e })}
        className={clsx(e.includedElsewhere && 'opacity-60')}
        meta={
          <>
            {e.note && <span>{e.note}</span>}
            {paidVia(e) && <span>{t.expenses.row.paidVia(paidVia(e)!)}</span>}
            {e.tariff && !e.includedElsewhere && <span className="tabular">{t.expenses.row.kwhPerMonth(formatAmount(e.tariff.kwh))}</span>}
            {(notMonthly || itemCurrency !== currency) && rate !== undefined && monthly > 0 && !e.includedElsewhere && (
              <span className="tabular">{t.expenses.row.approxPerMonth(formatMoney(monthly * rate, currency))}</span>
            )}
            {ranged && !e.includedElsewhere && (
              <span className="tabular">
                {t.expenses.row.varies(formatMoneyRange(spread.low, spread.high, itemCurrency), notMonthly)}
              </span>
            )}
            {isIrregular(e.frequency, e.occurrences) && e.nextDate && <span>{t.expenses.row.next(formatDate(e.nextDate))}</span>}
            {e.includedElsewhere && <Chip tone="neutral">{t.expenses.row.includedElsewhere}</Chip>}
            {suggestion && <Chip tone="orange">{t.expenses.row.estimateOutdated}</Chip>}
            {!e.essential && <Chip tone="purple">{t.expenses.row.optional}</Chip>}
            {!e.committed && <Chip tone="blue">{t.expenses.row.flexible}</Chip>}
          </>
        }
        fields={
          <>
            <MoneyField
              size="sm"
              currency={itemCurrency}
              value={e.amount}
              placeholder={ranged && e.amount === 0 ? String(Math.round(amountSpread(e).typical)) : undefined}
              title={
                e.tariff
                  ? t.expenses.row.calculatedTitle
                  : e.occurrences
                    ? t.expenses.row.priceEachTime
                    : ranged
                      ? t.expenses.row.typicalAmount
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
          { label: t.expenses.row.editDetails, icon: Pencil, onSelect: () => setEditing({ ...e }) },
          { label: t.expenses.row.remove, icon: Trash2, danger: true, onSelect: () => removeExpense(e.id) },
        ]}
      />
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-muted">
          {items.length === 0 ? t.expenses.list.nothingYet : t.expenses.list.count(items.length)}
        </p>
        <Button variant="secondary" size="sm" icon={Plus} onClick={() => setAdding(true)}>
          {t.expenses.list.addExpense}
        </Button>
      </div>

      {items.length === 0 && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-page/60 px-3 py-5 text-[13px] font-medium text-brand-700 hover:bg-brand-50"
        >
          <Plus size={14} /> {t.expenses.list.addFirst(CATEGORY_META[category].shortLabel)}
        </button>
      )}

      {showGroups
        ? grouped.map(([group, list]) => (
            <div key={group}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-[12px] font-semibold text-faint">{groupLabel(group)}</h3>
                {group === 'Food & drink' && <GroupBudget group="food" className="min-w-0 flex-1 justify-end" />}
              </div>
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
  const t = useT();
  const currency = useCurrency();
  return (
    <Sheet
      open={draft !== null}
      onClose={onClose}
      title={draft?.id ? t.expenses.sheet.editTitle : t.expenses.sheet.newTitle}
      subtitle={draft && !showCategory ? CATEGORY_META[draft.category].label : undefined}
      footer={
        <div className="flex items-center gap-2">
          {onRemove && draft?.id && (
            <Button variant="ghost" icon={Trash2} onClick={onRemove} className="mr-auto text-red-500 hover:bg-red-100">
              {t.expenses.sheet.remove}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} className="ml-auto">
            {t.expenses.sheet.cancel}
          </Button>
          <Button onClick={onSave} disabled={!draft?.name.trim()}>
            {draft?.id ? t.expenses.sheet.save : t.expenses.sheet.addExpense}
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
  const t = useT();
  const tf = t.expenses.form;
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
  const amountCurrency = draft.currency ?? currency;
  const rate = fxRate(plan.fx, amountCurrency, currency, monthKeyOf(new Date()));
  // Everything below shows the monthly figure in the plan currency; unknown until the rate has loaded.
  const monthly = monthlySpread(draft).typical * (rate ?? 0);
  const [estimating, setEstimating] = useState(false);
  const tariffPart = tariffPartFor(draft.subcategory);
  const setTariff = (tariff: ElectricityTariff | undefined) => onChange(withTariffAmounts({ ...draft, tariff }));
  const startTariff = () => {
    if (!tariffPart) return;
    const sibling = plan.expenses.find((x) => x.tariff && x.id !== draft.id)?.tariff;
    setTariff(defaultTariff(tariffPart, { sibling, kommunCode: homeKommunCode(plan) }));
  };
  const toggleTag = (tag: ExpenseTag) =>
    set({ tags: draft.tags.includes(tag) ? draft.tags.filter((x) => x !== tag) : [...draft.tags, tag] });
  return (
    <div className="space-y-4">
      {showCategory && (
        <SelectField
          label={tf.category}
          hint={tf.categoryHint}
          value={draft.category}
          onValueChange={(category: ExpenseCategory) => set({ category })}
          options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_META[c].label }))}
        />
      )}
      <TextField label={tf.name} value={draft.name} onChange={(e) => set({ name: e.target.value })} autoFocus={!draft.id} />
      {draft.tags.includes('subscription') && (
        <BrandPicker name={draft.name} domain={draft.brandDomain} onPick={(brandDomain) => set({ brandDomain })} />
      )}
      <SelectField
        label={tf.paidVia}
        hint={tf.paidViaHint}
        value={passThroughBrand(normalizeParty(draft.bankMatch?.counterparty)) ?? ''}
        onValueChange={(brand) => set({ bankMatch: brand ? { counterparty: brand } : undefined })}
        options={[{ value: '', label: tf.paidViaBank }, ...(['KLARNA', 'PAYPAL'] as const).map((b) => ({ value: b, label: PASS_THROUGH_LABEL[b] }))]}
      />
      {draft.tags.includes('subscription') && <SharedWith draft={draft} set={set} />}
      {draft.bankMatch && !paidVia(draft) && (
        <div className="flex items-center justify-between gap-3 text-[12.5px] text-muted">
          <span>{t.bank.income.recognised(draft.bankMatch.counterparty)}</span>
          <Button variant="secondary" size="sm" onClick={() => set({ bankMatch: undefined })}>
            {t.bank.income.forgetMatch}
          </Button>
        </div>
      )}
      <TextField
        label={tf.note}
        hint={tf.optionalHint}
        placeholder={tf.notePlaceholder}
        value={draft.note ?? ''}
        onChange={(e) => set({ note: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-3">
        <MoneyField
          label={
            draft.tariff
              ? tf.calculatedAmount
              : draft.occurrences
                ? draft.fixed
                  ? tf.priceEachTime
                  : tf.typicalPrice
                : draft.fixed
                  ? tf.amount
                  : tf.typicalAmount
          }
          hint={
            draft.tariff
              ? tf.averageMonthHint
              : draft.occurrences && perPurchaseHint
                ? `(${perPurchaseHint.toLowerCase()})`
                : !draft.fixed && hasRange
                  ? tf.budgetForHint
                  : undefined
          }
          currency={amountCurrency}
          value={draft.tariff ? spread.typical : draft.amount}
          placeholder={hasRange && draft.amount === 0 ? String(Math.round(spread.typical)) : undefined}
          onValueChange={(amount) => set({ amount })}
          disabled={!!draft.tariff}
        />
        <SelectField
          label={tf.howOften}
          value={cadenceOf(draft)}
          onValueChange={(c: Cadence) => set(cadencePatch(draft, c))}
          options={cadenceOptions(draft)}
          disabled={!!draft.tariff}
        />
      </div>
      {!draft.tariff && !draft.priceLink && (
        <div>
          <SelectField
            label={tf.currency}
            value={amountCurrency}
            onValueChange={(c) => set({ currency: c === currency ? undefined : c })}
            options={currencyOptions(currency, amountCurrency)}
          />
          {amountCurrency !== currency && (
            <p className="mt-1.5 text-[12px] text-muted">
              {tf.converted(currency, rate === undefined ? null : `1 ${amountCurrency} = ${formatNumber(rate)} ${currency}`)}
            </p>
          )}
        </div>
      )}
      {draft.occurrences && (
        <div className="grid grid-cols-2 gap-3">
          <CountField
            label={tf.times}
            value={draft.occurrences.times}
            onValueChange={(times) => set(occurrencesPatch({ ...draft.occurrences!, times }))}
          />
          <SelectField
            label={tf.per}
            value={draft.occurrences.per}
            onValueChange={(per) => set(occurrencesPatch({ ...draft.occurrences!, per }))}
            options={[
              { value: 'week', label: tf.week },
              { value: 'month', label: tf.month },
              { value: 'year', label: tf.year },
            ]}
          />
        </div>
      )}
      {draft.subcategory === 'groceries' && (
        <div className="rounded-xl border border-line bg-page/40 p-3">
          {estimating ? (
            <HouseholdFoodEstimator
              currency={currency}
              applyLabel={(m) => tf.useAmount(formatMoney(amountForMonthly(draft, m), currency), cadenceOf(draft))}
              onApply={(m) => {
                set({ amount: amountForMonthly(draft, m) });
                setEstimating(false);
              }}
              onCancel={() => setEstimating(false)}
            />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 flex-1 text-[12.5px] text-muted">{tf.notSure}</p>
              <Button size="sm" variant="soft" onClick={() => setEstimating(true)}>
                {tf.estimateFromHousehold}
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
              label={tf.calculateFromUsage}
              description={tariffPart === 'supply' ? tf.supplyFormula : tf.gridFormula}
            />
          )}
          {draft.tariff ? (
            <TariffFields tariff={draft.tariff} onChange={setTariff} currency={currency} />
          ) : (
            <>
              <div className={clsx('mb-2 text-[12.5px] font-medium text-ink-soft', tariffPart && 'mt-3')}>
                {tf.usualRange}
                <span className="ml-1 font-normal text-faint">
                  {tf.rangeQualifier(draft.occurrences ? null : draft.frequency)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MoneyField
                  label={tf.cheapest}
                  currency={amountCurrency}
                  value={draft.range?.low ?? 0}
                  onValueChange={(low) => setRange({ low })}
                />
                <MoneyField
                  label={tf.mostExpensive}
                  currency={amountCurrency}
                  value={draft.range?.high ?? 0}
                  onValueChange={(high) => setRange({ high })}
                />
              </div>
              <p className="mt-2 text-[12px] text-muted">
                {hasRange
                  ? draft.occurrences
                    ? tf.budgetsEachTime(formatMoney(spread.typical, amountCurrency), formatMoneyRange(spread.low, spread.high, amountCurrency))
                    : tf.budgetsPeriod(
                        formatMoney(spread.typical, amountCurrency),
                        draft.frequency,
                        formatMoneyRange(spread.low, spread.high, amountCurrency),
                      )
                  : draft.occurrences
                    ? tf.rangeHelpEachTime
                    : everyday
                      ? tf.rangeHelpEveryday(draft.frequency)
                      : tf.rangeHelpBill}
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
              label={tf.billCovers}
              hint={tf.billCoversHint}
              className="mt-3"
              value={String(Math.min(2, Math.max(0, draft.billingLag ?? 0))) as '0' | '1' | '2'}
              onValueChange={(v) => set({ billingLag: Number(v) || undefined })}
              options={lagOptions()}
            />
          )}
        </div>
      )}
      {draft.frequency !== 'monthly' && draft.frequency !== 'weekly' && !draft.occurrences && (
        <DateField
          label={draft.frequency === 'once' ? tf.expectedDate : tf.nextDueDate}
          hint={tf.dateHint}
          value={draft.nextDate ?? ''}
          onChange={(e) => set({ nextDate: e.target.value || undefined })}
        />
      )}
      {(draft.frequency !== 'monthly' || draft.occurrences || everyday || amountCurrency !== currency) && monthly > 0 && !draft.tariff && (
        <p className="tabular -mt-2 text-[12px] text-muted">
          {tf.approxMonthly(formatMoney(monthly, currency))}
          {everyday && tf.approxWeekDay(formatMoney(monthlyToWeekly(monthly), currency), formatMoney(monthlyToDaily(monthly), currency))}
        </p>
      )}

      <div className="rounded-xl border border-line bg-page/60 p-3">
        <div className="mb-2 text-[12.5px] font-medium text-ink-soft">{tf.describe}</div>
        <div className="space-y-2.5">
          <ClassificationRow
            label={tf.amountRow}
            help={tf.amountHelp}
            value={draft.fixed ? 'fixed' : 'variable'}
            onChange={(v) =>
              v === 'fixed'
                ? set({ fixed: true, range: undefined, billingLag: undefined, tariff: undefined })
                : set({ fixed: false })
            }
            options={[
              { value: 'fixed', label: tf.fixed },
              { value: 'variable', label: tf.variable },
            ]}
          />
          <ClassificationRow
            label={tf.need}
            help={tf.needHelp}
            value={draft.essential ? 'essential' : 'optional'}
            onChange={(v) => set({ essential: v === 'essential' })}
            options={[
              { value: 'essential', label: tf.essential },
              { value: 'optional', label: tf.optional },
            ]}
          />
          <ClassificationRow
            label={tf.flexibility}
            help={tf.flexibilityHelp}
            value={draft.committed ? 'committed' : 'flexible'}
            onChange={(v) => set({ committed: v === 'committed' })}
            options={[
              { value: 'committed', label: tf.committed },
              { value: 'flexible', label: tf.flexible },
            ]}
          />
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-[12.5px] font-medium text-ink-soft">{tf.tags}</div>
        <div className="flex flex-wrap gap-1.5">
          {TAG_IDS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={clsx(
                'rounded-full border px-2.5 py-1 text-[12px] font-medium transition',
                draft.tags.includes(tag)
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-line bg-card text-muted hover:text-ink',
              )}
            >
              {t.expenses.tags[tag]}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[12px] text-muted">{tf.tagsHelp}</p>
      </div>

      {draft.subcategory === 'groceries' && !draft.tariff && <FoodPriceLinkSwitch draft={draft} onChange={set} />}

      <Switch
        checked={!!draft.includedElsewhere}
        onChange={(includedElsewhere) => set({ includedElsewhere })}
        label={tf.includedElsewhere}
        description={tf.includedElsewhereHelp}
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
  const tb = useT().expenses.bills;
  const history = actualsHistory(draft);
  if (!history) return null;
  const suggestion = suggestFromActuals(draft);
  const recent = history.entries.slice(0, 6);
  const usage = draft.tariff ? usageFromBills(draft.tariff, history.entries) : null;
  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="mb-1.5 flex items-center justify-between text-[12px]">
        <span className="font-medium text-ink-soft">
          {tb.recorded}
          <span className="ml-1 font-normal text-faint">({history.count})</span>
        </span>
        <span className="tabular text-muted">
          {tb.average(formatMoney(history.average, currency), formatMoneyRange(history.min, history.max, currency))}
        </span>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {recent.map((x) => (
          <li key={x.month} className="tabular rounded-md bg-page px-2 py-1 text-[11.5px] text-ink-soft">
            {formatMonthKey(x.month)}: <span className="font-medium text-ink">{formatMoney(x.amount, currency)}</span>
          </li>
        ))}
        {history.count > recent.length && (
          <li className="rounded-md px-1 py-1 text-[11.5px] text-faint">{tb.more(history.count - recent.length)}</li>
        )}
      </ul>
      {suggestion && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-orange-100/70 px-3 py-2 text-[12px] text-orange-800">
          <Sparkles size={14} className="shrink-0 text-orange-500" />
          <span className="min-w-0 flex-1">
            {tb.suggestionBefore(suggestion.basedOn)}
            <span className="tabular font-semibold">{formatMoney(suggestion.typical, currency)}</span>
            {tb.suggestionMiddle}
            <span className="tabular font-semibold">{formatMoneyRange(suggestion.low, suggestion.high, currency)}</span>
            {tb.suggestionAfter}
          </span>
          <Button size="sm" variant="soft" onClick={() => onApply(suggestion)}>
            {tb.useThese}
          </Button>
        </div>
      )}
      {usage && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-orange-100/70 px-3 py-2 text-[12px] text-orange-800">
          <Sparkles size={14} className="shrink-0 text-orange-500" />
          <span className="min-w-0 flex-1">
            {tb.usageBefore(usage.basedOn)}
            <span className="tabular font-semibold">{formatAmount(usage.kwh)} kWh</span>
            {tb.usageAfter}
          </span>
          <Button size="sm" variant="soft" onClick={() => onUseKwh(usage.kwh)}>
            {tb.useKwh(formatAmount(usage.kwh))}
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

const formatOre = (ore: number) => formatNumber(Math.round(ore * 10) / 10, 1);

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
  const tt = useT().expenses.tariff;
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
          {tt.whereYouLive}
        </div>
        <HomeFields compact />
      </div>

      <div>
        <div className="mb-2 text-[12.5px] font-medium text-ink-soft">
          {tt.usage}
          <span className="ml-1 font-normal text-faint">{tt.usageShared}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <MoneyField
            label={tt.perYear}
            currency="kWh"
            value={Math.round(tariff.kwh * 12)}
            onValueChange={(year) => set({ kwh: year / 12 })}
          />
          <MoneyField
            label={tt.lightMonth}
            currency="kWh"
            value={tariff.kwhLow ?? 0}
            onValueChange={(n) => set({ kwhLow: optional(n) })}
          />
          <MoneyField
            label={tt.heavyMonth}
            currency="kWh"
            value={tariff.kwhHigh ?? 0}
            onValueChange={(n) => set({ kwhHigh: optional(n) })}
          />
        </div>
        <p className="mt-1.5 text-[12px] text-muted">
          {tariff.kwh > 0 ? tt.averageMonthKwh(formatAmount(tariff.kwh)) : ''}
          {tt.yearlyFigure}
        </p>
      </div>

      <div>
        <div className="mb-2 text-[12.5px] font-medium text-ink-soft">
          {supply ? tt.electricityDeal : tt.gridTariff}
          <span className="ml-1 font-normal text-faint">{tt.inclVat}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MoneyField
            label={supply ? tt.spotPrice : tt.transferFee}
            currency="öre/kWh"
            inputClassName="pr-20!"
            value={tariff.energyPrice}
            onValueChange={(energyPrice) => set({ energyPrice, priceMonth: undefined })}
          />
          <MoneyField
            label={supply ? tt.surcharge : tt.energyTax}
            currency="öre/kWh"
            inputClassName="pr-20!"
            value={tariff.surcharge}
            onValueChange={(surcharge) => set({ surcharge })}
          />
          <MoneyField
            label={supply ? tt.monthlyFee : tt.subscription}
            hint={supply ? undefined : tt.powerFeeHint}
            currency={tt.perMonthUnit(currency)}
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
              ? tt.energyTaxIn(kommun.name, expectedTax, expectedTax === REDUCED_ENERGY_TAX_ORE)
              : tt.energyTaxGeneral(ENERGY_TAX_ORE, REDUCED_ENERGY_TAX_ORE)}
            {kommun && tariff.surcharge !== expectedTax && (
              <>
                {' '}
                <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => set({ surcharge: expectedTax })}>
                  {tt.useOre(expectedTax)}
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
  const ts = useT().expenses.spot;
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
      setState({ loading: false, error: err instanceof Error ? err.message : ts.loadError });
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-muted">
      {current ? (
        <span>
          {ts.averageFor(formatMonthKey(month), area)}
        </span>
      ) : (
        <>
          <Button size="sm" variant="soft" icon={CloudDownload} onClick={load} disabled={state.loading}>
            {state.loading ? ts.loading : ts.useAverage(formatMonthKey(month))}
          </Button>
          {tariff.priceMonth && (
            <span>
              {ts.nowUsing(formatMonthKey(tariff.priceMonth), tariff.priceArea ?? '')}
            </span>
          )}
        </>
      )}
      {state.error && <span className="text-red-500">{state.error}</span>}
      <span className="w-full text-faint">{ts.source}</span>
      <div className="w-full">
        <Switch
          checked={!!tariff.followSpot}
          onChange={(followSpot) => onChange({ ...tariff, priceArea: tariff.priceArea ?? area, followSpot })}
          label={ts.follow}
          description={ts.followHelp}
        />
      </div>
    </div>
  );
}

/**
 * Lets groceries follow SCB's food price index. Turning it on takes the current amount as the base at
 * the newest month of prices; the store rebases when the amount is edited by hand.
 */
function FoodPriceLinkSwitch({ draft, onChange }: { draft: Draft; onChange: (patch: Partial<Draft>) => void }) {
  const tp = useT().expenses.priceLink;
  const currency = useCurrency();
  const prices = useFoodPrices();
  const link = draft.priceLink;
  const month = link?.month ?? link?.baseMonth;
  return (
    <Switch
      checked={!!link}
      onChange={(on) => onChange({ priceLink: on ? foodPriceLink(draft, latestMonth(prices)) : undefined })}
      label={tp.follow}
      description={
        link && month
          ? month !== link.baseMonth
            ? tp.status(formatMoney(link.base.amount, currency), formatMonthKey(link.baseMonth), formatMonthKey(month))
            : tp.current(formatMonthKey(month))
          : tp.followHelp
      }
    />
  );
}

function TariffBreakdown({ tariff, currency }: { tariff: ElectricityTariff; currency: string }) {
  const tt = useT().expenses.tariff;
  const s = amountSpread({ amount: 0, frequency: 'monthly', tariff });
  if (s.typical <= 0) {
    return <p className="text-[12px] text-muted">{tt.enterUsage}</p>;
  }
  return (
    <p className="tabular rounded-lg bg-card px-3 py-2 text-[12px] text-muted">
      {formatAmount(tariff.kwh)} kWh × {formatOre(perKwh(tariff) * 100)} öre + {formatMoney(tariff.monthlyFee, currency)} ={' '}
      <span className="font-semibold text-ink">{formatMoney(s.typical, currency)}</span>
      {tt.inAverageMonth}
      {s.high > s.low && tt.lightToHeavy(formatMoneyRange(s.low, s.high, currency))}.
    </p>
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
  const ta = useT().expenses.add;
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState('');
  useEffect(() => {
    if (open) {
      setQuery('');
      setPreview('');
    }
  }, [open]);
  // The logo follows the typing at a delay, so each keystroke does not fetch an image.
  useEffect(() => {
    const timer = setTimeout(() => setPreview(query), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const used = new Set(existing.map((e) => e.subcategory));
  const all = suggestionsFor(category);
  const q = query.trim().toLowerCase();
  const filtered = q ? all.filter((s) => s.name.toLowerCase().includes(q)) : all;
  const groups = groupsFor(category).filter((g) => filtered.some((s) => s.group === g));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={ta.title(CATEGORY_META[category].shortLabel)}
      subtitle={ta.subtitle}
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
          placeholder={ta.searchPlaceholder}
          className="h-10 w-full rounded-xl border border-line bg-card pl-9 pr-3 text-[13.5px] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <button
        type="button"
        onClick={() => onCustom(query.trim())}
        className="mb-3 flex w-full items-center gap-2 rounded-xl border border-dashed border-brand-200 bg-brand-50/60 px-3 py-2.5 text-[13px] font-medium text-brand-700 hover:bg-brand-50"
      >
        {preview.trim() ? <BrandLogo name={preview.trim()} size="xs" /> : <Plus size={14} />}
        {q ? ta.create(query.trim()) : ta.createCustom}
      </button>

      {groups.map((g) => (
        <div key={g} className="mb-3">
          <div className="mb-1.5 text-[11.5px] font-semibold text-faint">{groupLabel(g)}</div>
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
        <p className="py-4 text-center text-[13px] text-muted">{ta.noMatches}</p>
      )}
    </Sheet>
  );
}
