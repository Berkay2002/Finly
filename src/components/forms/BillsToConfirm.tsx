import { Check, ChevronRight, Undo2 } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import { formatMoney, formatMoneyRange, formatMonthKey } from '@/engine/format';
import type { ActualLine, PendingBill } from '@/engine/metrics';
import { CATEGORY_META } from '@/engine/taxonomy';
import { usePlanStore } from '@/store/planStore';
import { useCurrency, useMetrics, useViewDate } from '@/store/selectors';
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
  const m = useMetrics();
  const currency = useCurrency();
  const [open, setOpen] = useState(false);
  const { pending, confirmed, variance, month } = m.actuals;
  if (pending.length === 0 && confirmed.length === 0) return null;

  const names = pending.map((p) => p.name);
  const summary =
    pending.length === 0
      ? `All ${confirmed.length} variable bill${confirmed.length === 1 ? '' : 's'} for ${formatMonthKey(month)} confirmed`
      : `${pending.length} bill${pending.length === 1 ? '' : 's'} still estimated for ${formatMonthKey(month)}`;
  const detail =
    pending.length === 0
      ? variance === 0
        ? 'Everything landed on plan.'
        : `Bills came in ${formatMoney(Math.abs(variance), currency)} ${variance > 0 ? 'above' : 'below'} plan.`
      : `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}. Enter the real figure when the invoice lands.`;

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
            {formatMoney(variance, currency, { sign: true })} vs plan
          </Chip>
        )}
        <span className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-brand-700">
          {pending.length > 0 ? 'Enter bills' : 'Review'}
          <ChevronRight size={14} />
        </span>
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={pending.length > 0 ? 'Bills to confirm' : 'Bills confirmed'}
        subtitle={`${formatMonthKey(month)} · estimates until the invoice lands`}
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Done
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

/** The pending and confirmed bills for the viewed month, with inline entry. */
export function BillsList({ onEdit }: { onEdit?: (expenseId: string) => void }) {
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
            <div className="text-[12px] font-semibold uppercase tracking-wide text-faint">Confirmed</div>
            <Chip tone={variance > 0 ? 'orange' : variance < 0 ? 'brand' : 'neutral'}>
              {variance === 0 ? 'On plan' : `${formatMoney(variance, currency, { sign: true })} vs plan`}
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
          ? 'Bills for the previous month usually arrive mid-month and are due at the end of it. Until then the estimate stands.'
          : pending.length > 0
            ? 'Estimated costs are budgeted at their typical amount. Enter what you actually paid once you know it.'
            : 'Safe to spend now runs on the real figures instead of the estimates. Recorded bills stay with the month.'}
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
  const [value, setValue] = useState(0);
  const meta = CATEGORY_META[bill.category];
  const estimate = bill.varies
    ? `estimated ${formatMoney(bill.monthly, currency)}, usually ${formatMoneyRange(bill.monthlyLow, bill.monthlyHigh, currency)}`
    : `estimated ${formatMoney(bill.monthly, currency)}`;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
      <button
        type="button"
        onClick={onEdit}
        disabled={!onEdit}
        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
        title={onEdit ? 'Edit expense' : undefined}
      >
        <IconTile icon={CATEGORY_ICON[bill.category]} accent={meta.accent} size="sm" />
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-medium text-ink">{bill.name}</div>
          <div className="text-[12px] text-muted">
            {bill.billingLag > 0 ? `Bill for ${formatMonthKey(bill.periodMonth)} · ` : ''}
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
          aria-label={`Actual amount for ${bill.name}`}
          className="min-w-0 flex-1 sm:w-36 sm:flex-none"
        />
        <Button type="submit" size="sm" variant={value > 0 ? 'primary' : 'secondary'} icon={Check} disabled={value <= 0}>
          Confirm
        </Button>
      </form>
    </li>
  );
}

function ConfirmedRow({ bill, currency, onClear }: { bill: ActualLine; currency: string; onClear: () => void }) {
  const meta = CATEGORY_META[bill.category];
  const tone = bill.variance > 0 ? 'orange' : bill.variance < 0 ? 'brand' : 'neutral';
  return (
    <li className="flex items-center gap-3 py-2.5">
      <IconTile icon={CATEGORY_ICON[bill.category]} accent={meta.accent} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium text-ink">{bill.name}</div>
        <div className="text-[12px] text-muted">
          {bill.billingLag > 0 ? `Bill for ${formatMonthKey(bill.periodMonth)} · ` : ''}
          planned {formatMoney(bill.monthly, currency)}
        </div>
      </div>
      <div className="text-right">
        <div className="tabular text-[13.5px] font-semibold text-ink">{formatMoney(bill.actual, currency)}</div>
        <Chip tone={tone} className="mt-0.5">
          {bill.variance === 0 ? 'On plan' : formatMoney(bill.variance, currency, { sign: true })}
        </Chip>
      </div>
      <IconButton icon={Undo2} label="Clear this bill" onClick={onClear} />
    </li>
  );
}
