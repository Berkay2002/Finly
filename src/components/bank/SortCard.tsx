import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useOpenParam } from '@/components/forms/BillsToConfirm';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { classifiedTxs, reconcileSpending } from '@/bank/useBankSync';
import { useBankStore } from '@/bank/bankStore';
import { closeTo, lentOut, normalizeParty, owedOn, partyLabel, sharerCount, toSort, type ClassifiedTx, type MerchantToSort } from '@/engine/bankActuals';
import { SPEND_GROUP_META, SPEND_GROUPS, spendGroupOf } from '@/engine/everyday';
import { formatDate, formatMoney } from '@/engine/format';
import { monthKeyOf } from '@/engine/metrics';
import { savingsPots } from '@/engine/savings';
import { mobileKey } from '@/engine/vcard';
import { expenseName } from '@/engine/taxonomy';
import type { SpendGroup } from '@/engine/types';
import { useT } from '@/i18n';
import { usePlanStore } from '@/store/planStore';
import { useCurrency, usePlan } from '@/store/selectors';
import { customDraft, type ExpenseDraft } from '@/components/forms/ExpenseEditor';
import { ACCENT, type Accent } from '@/components/ui/accent';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { SelectField } from '@/components/ui/fields';
import { IconTile } from '@/components/ui/IconTile';
import { Sheet } from '@/components/ui/Sheet';

/**
 * Money out that no rule places yet, and money lent that has not come back. It already counts as
 * spent; sorting only moves it to the right group or bill. One line on the dashboard, the list in a
 * sheet. Nothing without a connected bank.
 */
/** What still needs sorting; the bell in the top bar shows the same count. */
export function useToSort() {
  const plan = usePlan();
  const txs = useBankStore((s) => s.txs);
  const contacts = useBankStore((s) => s.contacts);
  const data = useMemo(
    () => {
      // Only this month and the last: what is older changes nothing the bank still writes.
      const now = new Date();
      const since = `${monthKeyOf(new Date(now.getFullYear(), now.getMonth() - 1, 1))}-01`;
      const classified = classifiedTxs();
      return {
        classified,
        merchants: toSort(classified, since, contacts),
        lent: lentOut(classified),
        incoming: classified.filter((tx) => tx.class === 'unsorted' && tx.amount > 0 && !tx.pending && tx.id && tx.date >= since),
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- classifiedTxs reads both stores
    [txs, plan, contacts],
  );
  const count = data.merchants.length + data.incoming.length;
  const names = [...data.merchants.map((m) => m.label), ...data.incoming.map((i) => partyLabel(i, contacts))];
  return { ...data, count, names, hasBank: Object.values(txs).some((list) => list.length) };
}

export function SortCard({ className, onAddBill }: { className?: string; onAddBill: (draft: ExpenseDraft) => void }) {
  const plan = usePlan();
  const contacts = useBankStore((s) => s.contacts);
  const t = useT().bank.sort;
  const [open, setOpen] = useOpenParam('sort');

  // A new rule, or a bill added from here, places lines at once instead of at the next read from the bank.
  useEffect(() => reconcileSpending(), [plan.expenses, plan.bank]);

  const { merchants, lent, incoming, classified, count, names, hasBank } = useToSort();
  if (!hasBank) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={clsx('card flex w-full items-center gap-3 px-4 py-3 text-left transition hover:border-line-strong', className)}
      >
        <IconTile icon="card-upcoming" accent="blue" size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium text-ink">{count ? t.strip(count) : lent.length ? t.lentTitle : t.sortedTitle}</div>
          <div className="truncate text-[12px] text-muted">
            {count ? t.stripDetail(names.slice(0, 3), Math.max(0, names.length - 3)) : lent.length ? t.lentDetail(lent.map((tx) => partyLabel(tx, contacts))) : t.sortedDetail}
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-brand-700">
          {t.open}
          <ChevronRight size={14} />
        </span>
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t.title}
        subtitle={t.subtitle}
        footer={
          <div className="flex items-center justify-between gap-3">
            <Link to="/bank" className="text-[12.5px] font-medium text-brand-700" onClick={() => setOpen(false)}>
              {t.allLink}
            </Link>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t.done}
            </Button>
          </div>
        }
      >
        {lent.length > 0 && (
          <div className="mb-4">
            <div className="mb-1 text-[12px] font-semibold text-faint">{t.lentTitle}</div>
            <ul className="divide-y divide-line">
              {lent.map((tx) => (
                <LentRow key={tx.id} tx={tx} />
              ))}
            </ul>
            <p className="mt-1.5 text-[12px] text-muted">{t.lentHint}</p>
          </div>
        )}
        {incoming.length > 0 && (
          <div className="mb-4">
            <div className="mb-1 text-[12px] font-semibold text-faint">{t.inTitle}</div>
            <ul className="divide-y divide-line">
              {incoming.map((tx) => (
                <InRow key={tx.id} tx={tx} lent={lent} classified={classified} />
              ))}
            </ul>
          </div>
        )}
        {merchants.length > 0 ? (
          <ul className="divide-y divide-line">
            {merchants.map((m) => (
              <Row key={m.key} merchant={m} onAddBill={onAddBill} />
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted">{t.empty}</p>
        )}
      </Sheet>
    </>
  );
}

type Choice = SpendGroup | `bill:${string}` | `pot:${string}` | 'new' | 'lent' | 'half' | 'gift' | 'transfer' | 'ignore';

const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

/** Where a payee's lines sit now, as the select shows it; nothing while unsorted. */
export function placed(tx: ClassifiedTx | undefined): Choice | undefined {
  switch (tx?.class) {
    case 'spend':
      return tx.group;
    case 'expense':
      return tx.expenseId ? `bill:${tx.expenseId}` : undefined;
    case 'internal_transfer':
      return tx.potId ? `pot:${tx.potId}` : 'transfer';
    case 'ignored':
      return 'ignore';
    case 'lent':
      return tx.mine ? 'half' : 'lent';
    default:
      return undefined;
  }
}

/** The colour a line's avatar takes: its spend group, or what kind of line it is. */
export function accentOf(tx: ClassifiedTx | undefined): Accent {
  if (!tx) return 'neutral';
  if (tx.amount > 0 && tx.class !== 'expense' && tx.class !== 'spend') return 'green';
  switch (tx.class) {
    case 'spend':
      return ({ food: 'green', transport: 'blue', leisure: 'purple', other: 'orange' } as const)[tx.group ?? 'other'];
    case 'expense':
    case 'statement':
      return 'brand';
    case 'internal_transfer':
      return 'indigo';
    case 'lent':
      return 'lavender';
    default:
      return 'neutral';
  }
}

/** A payee's initial in a tinted circle, in place of the logo the bank never sends. */
export function Avatar({ label, accent }: { label: string; accent: Accent }) {
  const letter = label.replace(/^Swish · /, '').trim().charAt(0).toUpperCase() || '·';
  return <span className={clsx('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold', ACCENT[accent].tile)}>{letter}</span>;
}

/** Amount on the right of a row: money in green with its sign, money out plain. */
export function Amount({ value, currency }: { value: number; currency: string }) {
  return <span className={clsx('tabular shrink-0 text-[13.5px] font-medium', value > 0 ? 'text-green-500' : 'text-ink')}>{formatMoney(value, currency, { sign: true })}</span>;
}

/** A small on/off drawn as a chip, one tap to flip. */
function ToggleChip({ on, onLabel, offLabel, onChange }: { on: boolean; onLabel: string; offLabel: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="press min-w-0 truncate">
      <Chip tone={on ? 'brand' : 'neutral'} className={clsx('max-w-full truncate ring-1 ring-inset transition-colors', on ? 'ring-brand-200 hover:bg-brand-100' : 'ring-line hover:bg-line hover:text-ink')}>
        {on ? onLabel : offLabel}
      </Chip>
    </button>
  );
}

/** One payee (or one line) with where it sits as a chip; the chip is the select, one tap opens the choices. */
export function Row({ merchant, onAddBill, contribution, showDate = true, cluster = false }: { merchant: MerchantToSort; onAddBill: (draft: ExpenseDraft) => void; contribution?: string; showDate?: boolean; /** A payee for the month: the lines drop down, no date on the row. */ cluster?: boolean }) {
  const plan = usePlan();
  const [lines, setLines] = useState(false);
  const currency = useCurrency();
  const t = useT().bank.sort;
  const { setMerchantRule, setLineChoice, updateExpense, addExpense } = usePlanStore();
  const current = placed(merchant.lines[0]);
  const hint = current ? undefined : merchant.hint;
  // A bill learns the payee as the bank writes it, not the label shown: a Swish number may carry a name now.
  const party = merchant.lines[0]?.counterparty ?? merchant.label;
  // A person is never remembered: the next thing they are sent means something else.
  const person = !!mobileKey(party);
  // A payee with a rule already is usually changed for these lines only (one shop for a party), so that is the default.
  const ruled = !!plan.bank?.merchants?.[merchant.key];
  // Placed by Finly's own list or a bill's name, not by anything the user said.
  const first = merchant.lines[0];
  const onItem = first?.class === 'expense' ? plan.expenses.find((e) => e.id === first.expenseId) : undefined;
  const guessed =
    !!current &&
    !ruled &&
    !plan.bank?.lines?.[first?.id ?? ''] &&
    (first?.class === 'spend' || (!!onItem && !(onItem.bankMatch && normalizeParty(onItem.bankMatch.counterparty) === normalizeParty(party))));
  const [remember, setRemember] = useState(!person && !ruled);

  const options: { value: Choice; label: string }[] = [
    ...(hint ? [{ value: 'new' as const, label: t.addBill }] : []),
    ...SPEND_GROUPS.map((g) => ({ value: g, label: SPEND_GROUP_META[g].label })),
    ...plan.expenses.map((e) => ({ value: `bill:${e.id}` as const, label: t.bill(expenseName(e)) })),
    ...savingsPots(plan).map((p) => ({ value: `pot:${p.id}` as const, label: t.saving(p.name) })),
    ...(remember ? [{ value: 'transfer' as const, label: t.transfer }] : []),
    { value: 'half', label: t.half },
    { value: 'lent', label: t.lent },
    { value: 'gift', label: t.gift },
    { value: 'ignore', label: t.ignore },
  ];

  const choose = (choice: Choice) => {
    if (choice === current) return;
    if (remember) {
      // Leaving a bill for good: the item forgets this payee, or it would claim the lines again.
      const e = current?.startsWith('bill:') ? plan.expenses.find((x) => x.id === current.slice(5)) : undefined;
      if (e?.bankMatch && normalizeParty(e.bankMatch.counterparty) === normalizeParty(party)) updateExpense(e.id, { bankMatch: undefined });
      // What single lines were told gives way to the rule.
      for (const l of merchant.lines) if (l.id && plan.bank?.lines?.[l.id]) setLineChoice(l.id, null);
    }
    if (choice === 'new' && hint) {
      const draft = customDraft(hint.bill ? 'living' : 'leisure', titleCase(merchant.label), hint.bill ? [] : ['subscription']);
      onAddBill({ ...draft, amount: hint.amount, fixed: hint.fixed, bankMatch: { counterparty: party } });
    } else if (choice.startsWith('bill:')) {
      const id = choice.slice(5);
      const e = plan.expenses.find((x) => x.id === id);
      // A bill has one payee. One it already knows (or a Klarna mark) is kept; another store, or a person, is these lines only.
      const taken = e?.bankMatch && normalizeParty(e.bankMatch.counterparty) !== normalizeParty(party);
      if (!remember) {
        for (const l of merchant.lines) if (l.id) setLineChoice(l.id, { expenseId: id });
      } else if (e && spendGroupOf(e)) {
        // Groceries has many stores: the payee is remembered on its own, not as the item's one payee.
        setMerchantRule(merchant.key, { expenseId: id });
      } else if (taken) {
        for (const l of merchant.lines) if (l.id) setLineChoice(l.id, { expenseId: id });
      } else {
        // A fixed bill the bank shows at another amount than planned (a family plan shared with friends) is learnt at what the bank shows.
        const paid = Math.round((merchant.total / merchant.count) * 100) / 100;
        updateExpense(id, { bankMatch: { counterparty: party, ...(e?.fixed && Math.abs(paid - e.amount) > 0.5 ? { amount: paid } : {}) } });
        if (ruled) setMerchantRule(merchant.key, null);
      }
    } else if (choice.startsWith('pot:')) {
      // These lines go to that pot; later ones to the same place are transfers, told apart by their monthly amounts.
      for (const l of merchant.lines) if (l.id) setLineChoice(l.id, { potId: choice.slice(4) });
      if (remember) setMerchantRule(merchant.key, { action: 'transfer' });
    } else if (choice === 'transfer') {
      setMerchantRule(merchant.key, { action: 'transfer' });
    } else if (choice === 'lent' || choice === 'half') {
      for (const l of merchant.lines) if (l.id) setLineChoice(l.id, choice === 'half' ? { action: 'lent', mine: Math.round(-l.amount * 50) / 100 } : { action: 'lent' });
    } else if (choice === 'gift') {
      // A present is spent once, in its month: a one-off item in the plan, dated when it went out.
      const id = addExpense({ ...customDraft('planned', t.giftName(merchant.label.replace(/^Swish · /, '')), []), subcategory: 'gifts', amount: merchant.total, frequency: 'once', nextDate: merchant.lastDate });
      for (const l of merchant.lines) if (l.id) setLineChoice(l.id, { expenseId: id });
    } else {
      const rule = choice === 'ignore' ? ({ action: 'ignore' } as const) : { group: choice as SpendGroup };
      // Other is for these lines only: a parking fine does not make the payee always other.
      if (remember && choice !== 'other') setMerchantRule(merchant.key, rule);
      else for (const l of merchant.lines) if (l.id) setLineChoice(l.id, rule);
    }
  };

  return (
    <li className="py-2.5">
      <div className="flex items-center gap-3">
        <Avatar label={merchant.label} accent={accentOf(first)} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium text-ink">{merchant.label}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
            {cluster || merchant.count > 1 ? (
              <button type="button" onClick={() => setLines(!lines)} aria-expanded={lines} className="press tabular inline-flex shrink-0 items-center gap-0.5 hover:text-ink">
                {t.count(merchant.count)}
                <ChevronDown size={12} className={clsx('transition-transform', lines && 'rotate-180')} />
              </button>
            ) : (
              showDate && <span className="tabular shrink-0">{formatDate(merchant.lastDate)}</span>
            )}
            <SelectField chip={current ? 'neutral' : 'brand'} value={current ?? ('' as Choice)} placeholder={t.thisIs} onValueChange={choose} options={options} className="min-w-0" />
            {!person && <ToggleChip on={ruled ? !remember : remember} onLabel={ruled ? t.thisTimeOnly : t.remember} offLabel={ruled ? t.remember : t.thisTimeOnly} onChange={(v) => setRemember(ruled ? !v : v)} />}
          </div>
        </div>
        <Amount value={-merchant.total} currency={currency} />
      </div>
      {lines && (
        <ul className="mt-1 divide-y divide-line pl-12">
          {[...merchant.lines].sort((a, b) => b.date.localeCompare(a.date)).map((l) => (
            <li key={l.id ?? `${l.date}${l.amount}`} className="tabular flex items-center justify-between py-1.5 text-[12.5px] text-muted">
              <span>{formatDate(l.date)}</span>
              <span>{formatMoney(l.amount, currency)}</span>
            </li>
          ))}
        </ul>
      )}
      {(contribution || hint || guessed) && (
        <div className="mt-1 pl-12 text-[12px]">
          {contribution && <p className="text-muted">{contribution}</p>}
          {hint && <p className="text-brand-700">{t.recurring(formatMoney(hint.amount, currency), hint.day)}</p>}
          {guessed && <p className="text-muted">{t.guessed}</p>}
        </div>
      )}
    </li>
  );
}

/** How far back a friend's money can pay for a purchase already sorted. */
const PAYBACK_DAYS = 21;

/**
 * Money in from a person: paying back a purchase (one waiting, or any recent one, which then counts as
 * theirs for this much and yours for the rest), their share of a bill, or nothing to count.
 */
export function InRow({ tx, lent, classified, showDate = true }: { tx: ClassifiedTx; lent: ClassifiedTx[]; classified: ClassifiedTx[]; showDate?: boolean }) {
  const plan = usePlan();
  const currency = useCurrency();
  const contacts = useBankStore((s) => s.contacts);
  const t = useT().bank.sort;
  const { setMerchantRule, setLineChoice } = usePlanStore();
  const [monthly, setMonthly] = useState(false);
  const floor = new Date(Date.parse(`${tx.date}T12:00:00`) - PAYBACK_DAYS * 86400000).toISOString().slice(0, 10);
  // Recent purchases at least this big, the ones about twice or exactly this first (a split, or the whole thing).
  const recent = classified
    .filter((p) => p.id && !p.pending && p.amount <= -tx.amount && p.date >= floor && p.date <= tx.date && (p.class === 'spend' || p.class === 'unsorted'))
    .sort((a, b) => Number(closeTo(-b.amount, tx.amount * 2) || closeTo(-b.amount, tx.amount)) - Number(closeTo(-a.amount, tx.amount * 2) || closeTo(-a.amount, tx.amount)) || b.date.localeCompare(a.date))
    .slice(0, 12);
  const shared = plan.expenses.filter((e) => sharerCount(e) > 0);
  const choose = (v: string) => {
    if (v === 'ignore') setLineChoice(tx.id!, { action: 'ignore' });
    else if (v.startsWith('repays:')) setLineChoice(tx.id!, { repays: v.slice(7) });
    else if (v.startsWith('paysfor:')) {
      const p = classified.find((c) => c.id === v.slice(8))!;
      setLineChoice(p.id!, { action: 'lent', mine: Math.round((-p.amount - tx.amount) * 100) / 100 });
      setLineChoice(tx.id!, { repays: p.id! });
    } else if (monthly) setMerchantRule(tx.merchantKey!, { expenseId: v.slice(6), amount: tx.amount });
    else setLineChoice(tx.id!, { expenseId: v.slice(6) });
  };
  return (
    <li className="py-2.5">
      <div className="flex items-center gap-3">
        <Avatar label={partyLabel(tx, contacts)} accent="green" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium text-ink">{partyLabel(tx, contacts)}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
            {showDate && <span className="tabular shrink-0">{formatDate(tx.date)}</span>}
            <SelectField chip="brand" value="" placeholder={t.thisIs} onValueChange={choose} options={[
              ...lent.map((l) => ({ value: `repays:${l.id}`, label: t.paysBack(`${partyLabel(l, contacts)} · ${formatMoney(owedOn(l), currency)}`) })),
              ...recent.map((p) => ({ value: `paysfor:${p.id}`, label: t.paysBack(`${partyLabel(p, contacts)} · ${formatDate(p.date)} · ${formatMoney(-p.amount, currency)}`) })),
              ...[...shared, ...plan.expenses.filter((e) => !shared.includes(e))].map((e) => ({ value: `share:${e.id}`, label: t.share(expenseName(e)) })),
              { value: 'ignore', label: t.inIgnore },
          ]} className="min-w-0" />
            <ToggleChip on={monthly} onLabel={t.everyMonth} offLabel={t.everyMonth} onChange={setMonthly} />
          </div>
        </div>
        <Amount value={tx.amount} currency={currency} />
      </div>
    </li>
  );
}

/** Something bought for someone else, still waiting: it came back outside the bank, or it never will and was the person's own. */
function LentRow({ tx }: { tx: ClassifiedTx }) {
  const currency = useCurrency();
  const contacts = useBankStore((s) => s.contacts);
  const t = useT().bank.sort;
  const setLineChoice = usePlanStore((s) => s.setLineChoice);
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium text-ink">{partyLabel(tx, contacts)}</div>
        <div className="tabular text-[12px] text-muted">
          {formatDate(tx.date)} · {t.stillOut(formatMoney(owedOn(tx), currency))}
        </div>
      </div>
      <SelectField
        size="sm"
        value=""
        placeholder={t.paidBackBy}
        onValueChange={(v) => setLineChoice(tx.id!, v === 'cash' ? { action: 'ignore' } : { action: 'settled' })}
        options={[
          { value: 'cash', label: t.settled },
          { value: 'mine', label: t.mine },
        ]}
        className="w-44 shrink-0 sm:w-64"
      />
    </li>
  );
}
