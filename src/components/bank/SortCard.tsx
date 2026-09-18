import { ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { classifiedTxs, reconcileSpending } from '@/bank/useBankSync';
import { useBankStore } from '@/bank/bankStore';
import { lentOut, normalizeParty, partyLabel, toSort, type ClassifiedTx, type MerchantToSort } from '@/engine/bankActuals';
import { SPEND_GROUP_META, SPEND_GROUPS } from '@/engine/everyday';
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
import { Button } from '@/components/ui/Button';
import { SelectField, Switch } from '@/components/ui/fields';
import { IconTile } from '@/components/ui/IconTile';
import { Sheet } from '@/components/ui/Sheet';

/**
 * Money out that no rule places yet, and money lent that has not come back. It already counts as
 * spent; sorting only moves it to the right group or bill. One line on the dashboard, the list in a
 * sheet. Nothing without a connected bank.
 */
export function SortCard({ className, onAddBill }: { className?: string; onAddBill: (draft: ExpenseDraft) => void }) {
  const plan = usePlan();
  const txs = useBankStore((s) => s.txs);
  const contacts = useBankStore((s) => s.contacts);
  const t = useT().bank.sort;
  const [open, setOpen] = useState(false);

  // A new rule, or a bill added from here, places lines at once instead of at the next read from the bank.
  useEffect(() => reconcileSpending(), [plan.expenses, plan.bank]);

  const { merchants, lent, incoming } = useMemo(
    () => {
      // Only this month and the last: what is older changes nothing the bank still writes.
      const now = new Date();
      const since = `${monthKeyOf(new Date(now.getFullYear(), now.getMonth() - 1, 1))}-01`;
      const classified = classifiedTxs();
      return {
        merchants: toSort(classified, since, contacts),
        lent: lentOut(classified),
        incoming: classified.filter((tx) => tx.class === 'unsorted' && tx.amount > 0 && !tx.pending && tx.id && tx.date >= since),
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- classifiedTxs reads both stores
    [txs, plan, contacts],
  );
  if (!merchants.length && !lent.length && !incoming.length) return null;

  const count = merchants.length + incoming.length;
  const names = [...merchants.map((m) => m.label), ...incoming.map((i) => partyLabel(i, contacts))];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={clsx('card flex w-full items-center gap-3 px-4 py-3 text-left transition hover:border-line-strong', className)}
      >
        <IconTile icon="card-upcoming" accent="blue" size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium text-ink">{count ? t.strip(count) : t.lentTitle}</div>
          <div className="truncate text-[12px] text-muted">
            {count ? t.stripDetail(names.slice(0, 3), Math.max(0, names.length - 3)) : t.lentDetail(lent.map((tx) => partyLabel(tx, contacts)))}
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
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t.done}
            </Button>
          </div>
        }
      >
        {lent.length > 0 && (
          <div className="mb-4">
            <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-faint">{t.lentTitle}</div>
            <ul className="divide-y divide-line">
              {lent.map((tx) => (
                <LentRow key={tx.id} tx={tx} incoming={incoming} />
              ))}
            </ul>
          </div>
        )}
        {incoming.length > 0 && (
          <div className="mb-4">
            <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-faint">{t.inTitle}</div>
            <ul className="divide-y divide-line">
              {incoming.map((tx) => (
                <InRow key={tx.id} tx={tx} lent={lent} />
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

type Choice = SpendGroup | `bill:${string}` | `pot:${string}` | 'new' | 'lent' | 'gift' | 'transfer' | 'ignore';

const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

function Row({ merchant, onAddBill }: { merchant: MerchantToSort; onAddBill: (draft: ExpenseDraft) => void }) {
  const plan = usePlan();
  const currency = useCurrency();
  const t = useT().bank.sort;
  const { setMerchantRule, setLineChoice, updateExpense, addExpense } = usePlanStore();
  const hint = merchant.hint;
  // A bill learns the payee as the bank writes it, not the label shown: a Swish number may carry a name now.
  const party = merchant.lines[0]?.counterparty ?? merchant.label;
  // A person is never remembered: the next thing they are sent means something else.
  const person = !!mobileKey(party);
  const [remember, setRemember] = useState(!person);

  const options: { value: Choice; label: string }[] = [
    ...(hint ? [{ value: 'new' as const, label: t.addBill }] : []),
    ...SPEND_GROUPS.map((g) => ({ value: g, label: SPEND_GROUP_META[g].label })),
    ...plan.expenses.map((e) => ({ value: `bill:${e.id}` as const, label: t.bill(expenseName(e)) })),
    ...savingsPots(plan).map((p) => ({ value: `pot:${p.id}` as const, label: t.saving(p.name) })),
    ...(remember ? [{ value: 'transfer' as const, label: t.transfer }] : []),
    { value: 'lent', label: t.lent },
    { value: 'gift', label: t.gift },
    { value: 'ignore', label: t.ignore },
  ];

  const choose = (choice: Choice) => {
    if (choice === 'new' && hint) {
      const draft = customDraft(hint.bill ? 'living' : 'leisure', titleCase(merchant.label), hint.bill ? [] : ['subscription']);
      onAddBill({ ...draft, amount: hint.amount, fixed: hint.fixed, bankMatch: { counterparty: party } });
    } else if (choice.startsWith('bill:')) {
      const id = choice.slice(5);
      const e = plan.expenses.find((x) => x.id === id);
      // A bill has one payee. One it already knows (or a Klarna mark) is kept; another store, or a person, is these lines only.
      const taken = e?.bankMatch && normalizeParty(e.bankMatch.counterparty) !== normalizeParty(party);
      if (!remember || taken) {
        for (const l of merchant.lines) if (l.id) setLineChoice(l.id, { expenseId: id });
      } else {
        // A fixed bill the bank shows at another amount than planned (a family plan shared with friends) is learnt at what the bank shows.
        const paid = Math.round((merchant.total / merchant.count) * 100) / 100;
        updateExpense(id, { bankMatch: { counterparty: party, ...(e?.fixed && Math.abs(paid - e.amount) > 0.5 ? { amount: paid } : {}) } });
      }
    } else if (choice.startsWith('pot:')) {
      // These lines go to that pot; later ones to the same place are transfers, told apart by their monthly amounts.
      for (const l of merchant.lines) if (l.id) setLineChoice(l.id, { potId: choice.slice(4) });
      if (remember) setMerchantRule(merchant.key, { action: 'transfer' });
    } else if (choice === 'transfer') {
      setMerchantRule(merchant.key, { action: 'transfer' });
    } else if (choice === 'lent') {
      for (const l of merchant.lines) if (l.id) setLineChoice(l.id, { action: 'lent' });
    } else if (choice === 'gift') {
      // A present is spent once, in its month: a one-off item in the plan, dated when it went out.
      const id = addExpense({ ...customDraft('planned', t.giftName(merchant.label.replace(/^Swish · /, '')), []), subcategory: 'gifts', amount: merchant.total, frequency: 'once', nextDate: merchant.lastDate });
      for (const l of merchant.lines) if (l.id) setLineChoice(l.id, { expenseId: id });
    } else {
      const rule = choice === 'ignore' ? ({ action: 'ignore' } as const) : { group: choice as SpendGroup };
      if (remember) setMerchantRule(merchant.key, rule);
      else for (const l of merchant.lines) if (l.id) setLineChoice(l.id, rule);
    }
  };

  return (
    <li className="py-2.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium text-ink">{merchant.label}</div>
          <div className="tabular text-[12px] text-muted">
            {t.lines(merchant.count, formatDate(merchant.lastDate))} · {formatMoney(merchant.total, currency)}
          </div>
        </div>
        <SelectField size="sm" value={'' as Choice} placeholder={t.thisIs} onValueChange={choose} options={options} className="w-44 shrink-0 sm:w-64" />
      </div>
      {hint && <p className="mt-1 text-[12px] text-brand-700">{t.recurring(formatMoney(hint.amount, currency), hint.day)}</p>}
      {!person && <Switch className="mt-1.5" checked={remember} onChange={setRemember} description={t.remember} />}
    </li>
  );
}

/** Money in from a person: paying back what was bought for them, their share of a bill, or nothing to count. */
function InRow({ tx, lent }: { tx: ClassifiedTx; lent: ClassifiedTx[] }) {
  const plan = usePlan();
  const currency = useCurrency();
  const contacts = useBankStore((s) => s.contacts);
  const t = useT().bank.sort;
  const { setMerchantRule, setLineChoice } = usePlanStore();
  const [monthly, setMonthly] = useState(false);
  const choose = (v: string) => {
    if (v === 'ignore') setLineChoice(tx.id!, { action: 'ignore' });
    else if (v.startsWith('repays:')) setLineChoice(tx.id!, { repays: v.slice(7) });
    else if (monthly) setMerchantRule(tx.merchantKey!, { expenseId: v.slice(6), amount: tx.amount });
    else setLineChoice(tx.id!, { expenseId: v.slice(6) });
  };
  return (
    <li className="py-2.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium text-ink">{partyLabel(tx, contacts)}</div>
          <div className="tabular text-[12px] text-muted">
            {formatDate(tx.date)} · {formatMoney(tx.amount, currency)}
          </div>
        </div>
        <SelectField
          size="sm"
          value=""
          placeholder={t.thisIs}
          onValueChange={choose}
          options={[
            ...lent.map((l) => ({ value: `repays:${l.id}`, label: t.paysBack(`${partyLabel(l, contacts)} · ${formatMoney(-l.amount - (l.repaid ?? 0), currency)}`) })),
            ...plan.expenses.map((e) => ({ value: `share:${e.id}`, label: t.share(expenseName(e)) })),
            { value: 'ignore', label: t.inIgnore },
          ]}
          className="w-44 shrink-0 sm:w-64"
        />
      </div>
      <Switch className="mt-1.5" checked={monthly} onChange={setMonthly} description={t.everyMonth} />
    </li>
  );
}

/** Something bought for someone else: pick the payment that brought the money back, or close it. */
function LentRow({ tx, incoming }: { tx: ClassifiedTx; incoming: ClassifiedTx[] }) {
  const currency = useCurrency();
  const contacts = useBankStore((s) => s.contacts);
  const t = useT().bank.sort;
  const setLineChoice = usePlanStore((s) => s.setLineChoice);
  const outstanding = -tx.amount - (tx.repaid ?? 0);
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium text-ink">{partyLabel(tx, contacts)}</div>
        <div className="tabular text-[12px] text-muted">
          {formatDate(tx.date)} · {formatMoney(outstanding, currency)}
        </div>
      </div>
      <SelectField
        size="sm"
        value=""
        placeholder={t.paidBackBy}
        onValueChange={(id) => setLineChoice(id === 'settled' || id === 'mine' ? tx.id! : id, id === 'settled' ? { action: 'ignore' } : id === 'mine' ? { action: 'settled' } : { repays: tx.id! })}
        options={[
          ...incoming.map((i) => ({ value: i.id!, label: `${partyLabel(i, contacts)} · ${formatDate(i.date)} · ${formatMoney(i.amount, currency)}` })),
          { value: 'settled', label: t.settled },
          { value: 'mine', label: t.mine },
        ]}
        className="w-44 shrink-0 sm:w-64"
      />
    </li>
  );
}
