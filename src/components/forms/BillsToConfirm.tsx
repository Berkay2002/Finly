import { Check, ChevronRight, Undo2 } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import { formatMoney, formatMoneyRange, formatMonthKey } from '@/engine/format';
import type { ActualLine, PendingBill } from '@/engine/metrics';
import { CATEGORY_META, expenseName } from '@/engine/taxonomy';
import { useT } from '@/i18n';
import { usePlanStore } from '@/store/planStore';
import { useCurrency, useMetrics, usePlan, useViewDate } from '@/store/selectors';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { MoneyField } from '@/components/ui/fields';
import { CATEGORY_ICON } from '@/components/ui/icons';
import { IconTile } from '@/components/ui/IconTile';
import { Sheet } from '@/components/ui/Sheet';

/**
 * Variable bills are only estimates until the invoice lands. The dashboard shows one compact
 * strip for the viewed month; tapping it opens the list where the real figures are entered.
 * Renders nothing when the plan has no variable monthly items.
 */
export function BillsToConfirm({ className, onEdit }: { className?: string; onEdit?: (expenseId: string) => void }) {
  const t = useT();
  const m = useMetrics();
  const currency = useCurrency();
  const billName = useBillName();
  const [open, setOpen] = useState(false);
  const { pending, confirmed, variance, month } = m.actuals;
  if (pending.length === 0 && confirmed.length === 0) return null;

  const names = pending.map(billName);
  const summary =
    pending.length === 0
      ? t.bills.strip.allConfirmed(confirmed.length, formatMonthKey(month))
      : t.bills.strip.stillEstimated(pending.length, formatMonthKey(month));
  const detail =
    pending.length === 0
      ? variance === 0
        ? t.bills.strip.onPlan
        : variance > 0
          ? t.bills.strip.above(formatMoney(Math.abs(variance), currency))
          : t.bills.strip.below(formatMoney(Math.abs(variance), currency))
      : t.bills.strip.pending(names.slice(0, 3), Math.max(0, names.length - 3));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={clsx(
          'card flex w-full items-center gap-3 px-4 py-3 text-left transition hover:border-line-strong',
          className,
        )}
      >
        <IconTile icon="card-upcoming" accent={pending.length > 0 ? 'orange' : 'green'} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium text-ink">{summary}</div>
          <div className="truncate text-[12px] text-muted">{detail}</div>
        </div>
        {confirmed.length > 0 && variance !== 0 && (
          <Chip tone={variance > 0 ? 'orange' : 'brand'} className="hidden whitespace-nowrap sm:inline-flex">
            {t.bills.strip.vsPlan(formatMoney(variance, currency, { sign: true }))}
          </Chip>
        )}
        <span className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-brand-700">
          {pending.length > 0 ? t.bills.strip.enterBills : t.bills.strip.review}
          <ChevronRight size={14} />
        </span>
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={pending.length > 0 ? t.bills.sheet.toConfirm : t.bills.sheet.confirmed}
        subtitle={t.bills.sheet.subtitle(formatMonthKey(month))}
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t.bills.sheet.done}
            </Button>
          </div>
        }
      >
        <BillsList
          onEdit={
            onEdit
              ? (id) => {
                  setOpen(false);
                  onEdit(id);
                }
              : undefined
          }
        />
      </Sheet>
    </>
  );
}

/** A bill's name for display: a suggested item's default name follows the language. */
function useBillName(): (bill: { id: string; name: string }) => string {
  const plan = usePlan();
  return (bill) => {
    const item = plan.expenses.find((e) => e.id === bill.id);
    return item ? expenseName(item) : bill.name;
  };
}

/** The pending and confirmed bills for the viewed month, with inline entry. */
export function BillsList({ onEdit }: { onEdit?: (expenseId: string) => void }) {
  const t = useT();
  const m = useMetrics();
  const currency = useCurrency();
  const now = useViewDate();
  const setActual = usePlanStore((s) => s.setExpenseActual);
  const { pending, confirmed, variance, month } = m.actuals;
  const earlyInMonth = now.getDate() < 14;
  const anyLagged = pending.some((p) => p.billingLag > 0);

  return (
    <div>
      {pending.length > 0 && (
        <ul className="divide-y divide-line">
          {pending.map((bill) => (
            <PendingRow
              key={bill.id}
              bill={bill}
              currency={currency}
              onConfirm={(amount) => setActual(bill.id, month, amount)}
              onEdit={onEdit ? () => onEdit(bill.id) : undefined}
            />
          ))}
        </ul>
      )}

      {confirmed.length > 0 && (
        <div className={clsx(pending.length > 0 && 'mt-4 border-t border-line pt-3')}>
          <div className="mb-1 flex items-center justify-between">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-faint">{t.bills.list.confirmed}</div>
            <Chip tone={variance > 0 ? 'orange' : variance < 0 ? 'brand' : 'neutral'}>
              {variance === 0 ? t.bills.list.onPlan : t.bills.list.vsPlan(formatMoney(variance, currency, { sign: true }))}
            </Chip>
          </div>
          <ul className="divide-y divide-line">
            {confirmed.map((bill) => (
              <ConfirmedRow key={bill.id} bill={bill} currency={currency} onClear={() => setActual(bill.id, month, null)} />
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-[12px] text-muted">
        {pending.length > 0 && anyLagged && earlyInMonth
          ? t.bills.list.noteLagged
          : pending.length > 0
            ? t.bills.list.notePending
            : t.bills.list.noteConfirmed}
      </p>
    </div>
  );
}

function PendingRow({
  bill,
  currency,
  onConfirm,
  onEdit,
}: {
  bill: PendingBill;
  currency: string;
  onConfirm: (amount: number) => void;
  onEdit?: () => void;
}) {
  const t = useT();
  const name = useBillName()(bill);
  const [value, setValue] = useState(0);
  const meta = CATEGORY_META[bill.category];
  const estimate = bill.varies
    ? t.bills.row.estimatedRange(formatMoney(bill.monthly, currency), formatMoneyRange(bill.monthlyLow, bill.monthlyHigh, currency))
    : t.bills.row.estimated(formatMoney(bill.monthly, currency));
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
      <button
        type="button"
        onClick={onEdit}
        disabled={!onEdit}
        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
        title={onEdit ? t.bills.row.editExpense : undefined}
      >
        <IconTile icon={CATEGORY_ICON[bill.category]} accent={meta.accent} size="sm" />
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-medium text-ink">{name}</div>
          <div className="text-[12px] text-muted">
            {bill.billingLag > 0 ? t.bills.row.billFor(formatMonthKey(bill.periodMonth)) : ''}
            {estimate}
          </div>
        </div>
      </button>
      <form
        className="flex w-full items-center gap-2 sm:w-auto"
        onSubmit={(e) => {
          e.preventDefault();
          if (value > 0) onConfirm(value);
        }}
      >
        <MoneyField
          size="sm"
          currency={currency}
          value={value}
          onValueChange={setValue}
          placeholder={String(Math.round(bill.monthly))}
          aria-label={t.bills.row.actualFor(name)}
          className="min-w-0 flex-1 sm:w-36 sm:flex-none"
        />
        <Button type="submit" size="sm" variant={value > 0 ? 'primary' : 'secondary'} icon={Check} disabled={value <= 0}>
          {t.bills.row.confirm}
        </Button>
      </form>
    </li>
  );
}

function ConfirmedRow({ bill, currency, onClear }: { bill: ActualLine; currency: string; onClear: () => void }) {
  const t = useT();
  const name = useBillName()(bill);
  const fromBank = usePlan().expenses.some((e) => e.id === bill.id && e.bankMatch);
  const meta = CATEGORY_META[bill.category];
  const tone = bill.variance > 0 ? 'orange' : bill.variance < 0 ? 'brand' : 'neutral';
  return (
    <li className="flex items-center gap-3 py-2.5">
      <IconTile icon={CATEGORY_ICON[bill.category]} accent={meta.accent} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium text-ink">{name}</div>
        <div className="text-[12px] text-muted">
          {bill.billingLag > 0 ? t.bills.row.billFor(formatMonthKey(bill.periodMonth)) : ''}
          {t.bills.row.planned(formatMoney(bill.monthly, currency))}
          {fromBank && ` · ${t.bills.row.fromBank}`}
        </div>
      </div>
      <div className="text-right">
        <div className="tabular text-[13.5px] font-semibold text-ink">{formatMoney(bill.actual, currency)}</div>
        <Chip tone={tone} className="mt-0.5">
          {bill.variance === 0 ? t.bills.row.onPlan : formatMoney(bill.variance, currency, { sign: true })}
        </Chip>
      </div>
      <IconButton icon={Undo2} label={t.bills.row.clear} onClick={onClear} />
    </li>
  );
}
