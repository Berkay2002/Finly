import { ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { classifiedTxs, reconcileSpending } from '@/bank/useBankSync';
import { useBankStore } from '@/bank/bankStore';
import { recurringHint, toSort, type ClassifiedTx, type MerchantToSort } from '@/engine/bankActuals';
import { SPEND_GROUP_META, SPEND_GROUPS } from '@/engine/everyday';
import { formatDate, formatMoney } from '@/engine/format';
import { expenseName } from '@/engine/taxonomy';
import type { LineChoice, SpendGroup } from '@/engine/types';
import { useT } from '@/i18n';
import { usePlanStore } from '@/store/planStore';
import { useCurrency, usePlan } from '@/store/selectors';
import { customDraft, type ExpenseDraft } from '@/components/forms/ExpenseEditor';
import { Button } from '@/components/ui/Button';
import { SelectField, Switch } from '@/components/ui/fields';
import { IconTile } from '@/components/ui/IconTile';
import { Sheet } from '@/components/ui/Sheet';

/**
 * Money out that no rule places yet. It already counts as spent; sorting only moves it to the right
 * group or bill. One line on the dashboard, the list in a sheet. Nothing without a connected bank.
 */
export function SortCard({ className, onAddBill }: { className?: string; onAddBill: (draft: ExpenseDraft) => void }) {
  const plan = usePlan();
  const txs = useBankStore((s) => s.txs);
  const t = useT().bank.sort;
  const [open, setOpen] = useState(false);

  // A new rule, or a bill added from here, places lines at once instead of at the next read from the bank.
  useEffect(() => reconcileSpending(), [plan.expenses, plan.bank]);

  const merchants = useMemo(
    () => toSort(classifiedTxs()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- classifiedTxs reads both stores
    [txs, plan],
  );
  if (!merchants.length) return null;

  const count = merchants.reduce((n, m) => n + m.count, 0);
  const names = merchants.map((m) => m.label);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={clsx('card flex w-full items-center gap-3 px-4 py-3 text-left transition hover:border-line-strong', className)}
      >
        <IconTile icon="card-upcoming" accent="blue" size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium text-ink">{t.strip(count)}</div>
          <div className="truncate text-[12px] text-muted">{t.stripDetail(names.slice(0, 3), Math.max(0, names.length - 3))}</div>
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
        <ul className="divide-y divide-line">
          {merchants.flatMap((m) =>
            m.passThrough
              ? m.lines.map((line) => <Row key={line.id ?? `${line.date}-${line.amount}`} merchant={m} line={line} onAddBill={onAddBill} />)
              : [<Row key={m.key} merchant={m} onAddBill={onAddBill} />],
          )}
        </ul>
      </Sheet>
    </>
  );
}

type Choice = SpendGroup | `bill:${string}` | 'new' | 'transfer' | 'ignore';

const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

/** A payee, or one line of a pass-through payee such as Klarna. */
function Row({ merchant, line, onAddBill }: { merchant: MerchantToSort; line?: ClassifiedTx; onAddBill: (draft: ExpenseDraft) => void }) {
  const plan = usePlan();
  const currency = useCurrency();
  const t = useT().bank.sort;
  const { setMerchantRule, setLineChoice, updateExpense } = usePlanStore();
  const [remember, setRemember] = useState(!merchant.passThrough);
  const lines = line ? [line] : merchant.lines;
  const hint = recurringHint(lines, line ? Math.abs(line.amount) : undefined);

  const options: { value: Choice; label: string }[] = [
    ...(hint ? [{ value: 'new' as const, label: t.addBill }] : []),
    ...SPEND_GROUPS.map((g) => ({ value: g, label: SPEND_GROUP_META[g].label })),
    ...plan.expenses.map((e) => ({ value: `bill:${e.id}` as const, label: t.bill(expenseName(e)) })),
    ...(remember ? [{ value: 'transfer' as const, label: t.transfer }] : []),
    { value: 'ignore', label: t.ignore },
  ];

  const choose = (choice: Choice) => {
    if (choice === 'new' && hint) {
      const draft = customDraft(hint.bill ? 'living' : 'leisure', titleCase(merchant.label), hint.bill ? [] : ['subscription']);
      onAddBill({ ...draft, amount: hint.amount, fixed: hint.fixed, bankMatch: { counterparty: merchant.label, ...(line ? { amount: hint.amount } : {}) } });
      return;
    }
    if (choice.startsWith('bill:')) {
      // A pass-through carries many things, so the bill is told apart by its amount too.
      const amount = line ? Math.abs(line.amount) : undefined;
      updateExpense(choice.slice(5), { bankMatch: { counterparty: merchant.label, ...(amount ? { amount } : {}) } });
    } else if (choice === 'transfer') {
      setMerchantRule(merchant.key, { action: 'transfer' });
    } else {
      const rule: LineChoice = choice === 'ignore' ? { action: 'ignore' } : { group: choice as SpendGroup };
      if (remember) setMerchantRule(merchant.key, rule);
      else for (const l of lines) if (l.id) setLineChoice(l.id, rule);
    }
  };

  return (
    <li className="py-2.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium text-ink">{merchant.label}</div>
          <div className="tabular text-[12px] text-muted">
            {line ? formatDate(line.date) : t.lines(merchant.count, formatDate(merchant.lastDate))} · {formatMoney(line ? Math.abs(line.amount) : merchant.total, currency)}
          </div>
        </div>
        <SelectField size="sm" value={'' as Choice} placeholder={t.thisIs} onValueChange={choose} options={options} className="w-44 shrink-0" />
      </div>
      {hint && <p className="mt-1 text-[12px] text-brand-700">{t.recurring(formatMoney(hint.amount, currency), hint.day)}</p>}
      {merchant.passThrough ? (
        <p className="mt-1 text-[12px] text-muted">{t.passThrough}</p>
      ) : (
        <Switch className="mt-1.5" checked={remember} onChange={setRemember} description={t.remember} />
      )}
    </li>
  );
}
