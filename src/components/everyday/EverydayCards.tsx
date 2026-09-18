import { useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { monthlySpread } from '@/engine/amounts';
import { amountForMonthly, gapTarget, SPEND_GROUP_META, spendEntryFor, spendGroupOf, spendHistory, type SpendNudge, type SpendSummary } from '@/engine/everyday';
import { formatDate, formatMoney, formatMonthKey, formatNumber } from '@/engine/format';
import { monthKeyOf } from '@/engine/metrics';
import { expenseName } from '@/engine/taxonomy';
import type { ExpenseItem, SpendGroup } from '@/engine/types';
import { useT } from '@/i18n';
import { usePlanStore } from '@/store/planStore';
import { useCurrency, useFrozenMonth, useMetrics, usePlan } from '@/store/selectors';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { MoneyField } from '@/components/ui/fields';
import { IconTile } from '@/components/ui/IconTile';
import type { Accent } from '@/components/ui/accent';
import type { PictureName } from '@/components/ui/pictures';
import { ProgressBar } from '@/components/ui/ProgressBar';

const GROUP_LOOK: Record<SpendGroup, { icon: PictureName; accent: Accent }> = {
  food: { icon: 'nav-living', accent: 'green' },
  transport: { icon: 'nav-transport', accent: 'orange' },
  leisure: { icon: 'nav-leisure', accent: 'purple' },
};

function nudgeName(n: SpendNudge, expenses: ExpenseItem[]): string {
  const item = expenses.find((e) => e.id === n.id);
  return item ? expenseName(item) : n.name;
}

/** Per month, week and day, and the normal spread. */
export function SpendTiles({ summary, currency }: { summary: SpendSummary; currency: string }) {
  const t = useT().everyday.tiles;
  const money = (n: number) => formatMoney(n, currency);
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: t.perMonth, value: summary.monthly },
          { label: t.perWeek, value: summary.weekly },
          { label: t.perDay, value: summary.daily },
        ].map((t) => (
          <div key={t.label} className="min-w-0 rounded-xl bg-page px-2.5 py-2">
            <div className="text-[11.5px] text-muted">{t.label}</div>
            <div className="tabular whitespace-nowrap text-[14px] font-semibold text-ink">{money(t.value)}</div>
          </div>
        ))}
      </div>
      {summary.high > summary.low && (
        <p className="tabular mt-2 text-[12px] text-muted">
          {t.normalRange(money(summary.low), money(summary.high))}
        </p>
      )}
    </>
  );
}

/** "One fewer a week saves …", with a button that plans for it. */
export function SpendNudges({ nudges, currency }: { nudges: SpendNudge[]; currency: string }) {
  const plan = usePlan();
  const updateExpense = usePlanStore((s) => s.updateExpense);
  const t = useT().everyday.nudges;
  const money = (n: number) => formatMoney(n, currency);
  if (nudges.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-faint">{t.title}</div>
      <ul className="divide-y divide-line">
        {nudges.slice(0, 3).map((n) => (
          <li key={n.id} className="flex items-center gap-3 py-2 text-[13px]">
            <div className="min-w-0 flex-1">
              <div className="text-ink">
                {t.oneFewer(nudgeName(n, plan.expenses), n.per)}
              </div>
              <div className="tabular text-[12px] text-muted">
                {t.saves(money(n.monthly), money(n.monthly * 12))}
              </div>
            </div>
            <Button
              size="sm"
              variant="soft"
              onClick={() => {
                const e = plan.expenses.find((x) => x.id === n.id);
                if (e?.occurrences) updateExpense(n.id, { occurrences: { ...e.occurrences, times: Math.max(0, e.occurrences.times - 1) } });
              }}
              title={t.planFor(formatNumber(n.times - 1), n.per, formatNumber(n.times))}
            >
              {n.times - 1 > 0 ? t.timesPer(formatNumber(n.times - 1), n.per) : t.dropIt}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Everyday spending in a section broken down per week and day. Food has its own card with more. */
/**
 * The figure a group is planned at: what its items add up to, until the person types one for the whole group.
 * Typing the items' own total again clears it.
 */
export function GroupBudget({ group, className }: { group: SpendGroup; className?: string }) {
  const m = useMetrics();
  const currency = useCurrency();
  const { setEverydayBudget } = usePlanStore();
  const t = useT().everyday.budget;
  const g = m.everyday[group];
  const money = (n: number) => formatMoney(n, currency);
  return (
    <div className={clsx('flex items-center justify-between gap-3', className)}>
      <div className="min-w-0 text-[12px] text-muted">
        {g.budget ? t.set(money(g.itemsTotal)) : g.high > g.low ? t.fromItems(money(g.low), money(g.high)) : t.fromItemsFlat}
      </div>
      <MoneyField
        size="sm"
        currency={currency}
        value={g.monthly}
        onValueChange={(v) => setEverydayBudget(group, v > 0 && Math.round(v) !== Math.round(g.itemsTotal) ? v : null)}
        className="w-36 shrink-0"
      />
    </div>
  );
}

export function EverydayCard({ group, subtitle }: { group: Exclude<SpendGroup, 'food'>; subtitle: string }) {
  const m = useMetrics();
  const currency = useCurrency();
  const g = m.everyday[group];
  if (g.monthly <= 0) return null;
  const look = GROUP_LOOK[group];
  return (
    <Card>
      <CardHeader icon={<IconTile icon={look.icon} accent={look.accent} size="sm" />} title={SPEND_GROUP_META[group].label} subtitle={subtitle} />
      <GroupBudget group={group} className="mb-3" />
      <SpendTiles summary={g} currency={currency} />
      <SpendNudges nudges={g.nudges} currency={currency} />
    </Card>
  );
}

/**
 * What was really spent in a group. Everyday spending has no invoice, so the month gets one total read
 * off the bank app: part-way through for the pace, in full afterwards to compare with the plan.
 */
export function SpendMonthCard({ group }: { group: SpendGroup }) {
  const m = useMetrics();
  const plan = usePlan();
  const currency = useCurrency();
  const { key, frozen } = useFrozenMonth();
  const { setEverydaySpend, updateExpense } = usePlanStore();
  const g = m.everyday[group];
  const sm = g.month;
  const meta = SPEND_GROUP_META[group];
  const look = GROUP_LOOK[group];
  const money = (n: number) => formatMoney(n, currency);
  const t = useT().everyday.month;

  const today = new Date();
  const todayKey = monthKeyOf(today);
  const running = key === todayKey;
  const spend = plan.everydaySpend?.[group];
  const prevKey = monthKeyOf(new Date(today.getFullYear(), today.getMonth() - 1, 1));
  const prevEntry = spendEntryFor(spend, prevKey);
  const createdKey = monthKeyOf(new Date(plan.createdAt));
  const askPrev = running && g.monthly > 0 && (!prevEntry || prevEntry.asOf) && createdKey <= prevKey;
  // The frozen copy of a closed month only keeps that month, so history comes from the live plan.
  const history = spendHistory(spend, running ? key : todayKey, g.monthly);
  const target = gapTarget(group, plan.expenses);

  if (key > todayKey || (g.monthly <= 0 && sm.spent === undefined)) return null;

  const isoToday = `${todayKey}-${String(today.getDate()).padStart(2, '0')}`;
  const over = (sm.spent ?? 0) > sm.expectedByNow;
  const title = group === 'food' ? t.food : meta.label;
  const fromBank = spendEntryFor(spend, key)?.source === 'bank';
  // The group's total is its items (groceries, restaurants, ...) plus what the bank sorted straight into the group.
  const items = fromBank ? plan.expenses.filter((e) => spendGroupOf(e) === group && (e.actuals?.[key] ?? 0) > 0).map((e) => ({ id: e.id, name: expenseName(e), amount: e.actuals![key] })) : [];
  const rest = Math.round(((sm.spent ?? 0) - items.reduce((sum, i) => sum + i.amount, 0)) * 100) / 100;

  return (
    <Card>
      <CardHeader
        icon={<IconTile icon={group === 'food' ? 'card-per-day' : look.icon} accent={look.accent} size="sm" />}
        title={running ? t.titleThisMonth(title) : t.titleIn(title, formatMonthKey(key))}
        subtitle={
          running
            ? t.subtitleRunning(meta.noun)
            : t.subtitleClosed
        }
      />

      <MoneyField
        label={running ? t.spentSoFar : t.spentInTotal}
        hint={
          spendEntryFor(spend, key)?.source === 'bank'
            ? t.fromBank
            : running && sm.spent !== undefined && sm.day < today.getDate()
              ? t.updated(formatDate(`${key}-${String(sm.day).padStart(2, '0')}`))
              : undefined
        }
        currency={currency}
        value={sm.spent ?? 0}
        onValueChange={(amount) =>
          setEverydaySpend(group, key, amount > 0 ? (running ? { amount, asOf: isoToday } : { amount }) : null)
        }
      />
      {fromBank && items.length > 0 && (
        <dl className="tabular mt-2 space-y-1 text-[12.5px]">
          {items.map((i) => (
            <div key={i.id} className="flex justify-between gap-3">
              <dt className="text-muted">{i.name}</dt>
              <dd className="text-ink">{money(i.amount)}</dd>
            </div>
          ))}
          {rest > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t.rest(title)}</dt>
              <dd className="text-ink">{money(rest)}</dd>
            </div>
          )}
        </dl>
      )}
      {fromBank && (
        <Link to={`/bank?group=${group}&month=${key}`} className="mt-1 inline-block text-[12.5px] font-medium text-brand-700">
          {t.seeBank}
        </Link>
      )}

      {sm.spent !== undefined && g.monthly > 0 && (
        <div className="mt-3">
          <ProgressBar value={sm.spent / g.monthly} accent={over ? 'orange' : 'green'} />
          <dl className="mt-2 space-y-1 text-[12.5px]">
            {!sm.complete && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted">
                  {t.dayOf(sm.day, sm.daysInMonth)}
                </dt>
                <dd className="tabular text-ink">{money(sm.expectedByNow)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{sm.complete ? t.planned : t.plannedForMonth}</dt>
              <dd className="tabular text-ink">{money(g.monthly)}</dd>
            </div>
            {sm.projected !== undefined && sm.variance !== undefined && (
              <div className="flex justify-between gap-3">
                <dt className="font-medium text-ink">{sm.complete ? t.againstPlan : t.atThisPace}</dt>
                <dd className={clsx('tabular font-semibold', sm.variance > 0 ? 'text-warning' : 'text-positive')}>
                  {!sm.complete && `${money(sm.projected)} · `}
                  {formatMoney(sm.variance, currency, { sign: true })}
                </dd>
              </div>
            )}
          </dl>
          {!sm.complete && sm.left !== undefined && (
            <p className="tabular mt-2 text-[12.5px] text-muted">
              {sm.left > 0
                ? t.left(money(sm.left), money(sm.leftPerDay ?? 0), sm.daysInMonth - sm.day)
                : t.over(money(-sm.left))}
            </p>
          )}
          {sm.complete && frozen && (
            <p className="mt-2 text-[12px] text-muted">{t.frozen}</p>
          )}
        </div>
      )}

      {askPrev && (
        <PreviousMonthPrompt
          month={prevKey}
          noun={meta.noun}
          bankHint={meta.bankHint}
          partial={prevEntry}
          currency={currency}
          onSave={(amount) => setEverydaySpend(group, prevKey, { amount })}
        />
      )}

      {history.months.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="mb-1.5 flex items-center justify-between text-[12px]">
            <span className="font-medium text-ink-soft">{t.yourMonths}</span>
            {history.basedOn >= 2 && (
              <span className="tabular text-muted">
                {t.average(money(history.average), history.basedOn)}
              </span>
            )}
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {history.months.slice(0, 6).map((x) => {
              const chip = (
                <>
                  {formatMonthKey(x.month)}: <span className="font-medium text-ink">{money(x.amount)}</span>
                </>
              );
              // A month the bank wrote opens its lines, to check what went where.
              return (
                <li key={x.month} className="tabular rounded-md bg-page text-[11.5px] text-ink-soft">
                  {spendEntryFor(spend, x.month)?.source === 'bank' ? (
                    <Link to={`/bank?group=${group}&month=${x.month}`} className="block px-2 py-1 underline decoration-line underline-offset-2 hover:text-brand-700">
                      {chip}
                    </Link>
                  ) : (
                    <span className="block px-2 py-1">{chip}</span>
                  )}
                </li>
              );
            })}
          </ul>
          {history.gap !== null && (
            <div className="mt-2.5 rounded-lg bg-orange-100/70 px-3 py-2 text-[12px] text-orange-800">
              <p>
                {t.gapBefore(history.basedOn)}<span className="tabular font-semibold">{money(history.average)}</span>{t.gapMiddle}
                <span className="tabular font-semibold">{money(g.monthly)}</span>{t.gapAfter}
              </p>
              {target && (
                <Button
                  size="sm"
                  variant="soft"
                  className="mt-2"
                  onClick={() => {
                    const current = monthlySpread(target).typical;
                    updateExpense(target.id, { amount: amountForMonthly(target, Math.max(0, current + history.gap!)) });
                  }}
                >
                  {history.gap > 0
                    ? t.gapAdd(money(Math.abs(history.gap)), expenseName(target).toLowerCase())
                    : t.gapTake(money(Math.abs(history.gap)), expenseName(target).toLowerCase())}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function PreviousMonthPrompt({
  month,
  noun,
  bankHint,
  partial,
  currency,
  onSave,
}: {
  month: string;
  noun: string;
  bankHint: string;
  partial?: { amount: number; asOf?: string };
  currency: string;
  onSave: (amount: number) => void;
}) {
  const [value, setValue] = useState(0);
  const t = useT().everyday.previous;
  return (
    <form
      className="mt-4 rounded-xl border border-dashed border-line bg-page/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (value > 0) onSave(value);
      }}
    >
      <div className="text-[13px] font-medium text-ink">
        {t.question(noun, formatMonthKey(month))}
      </div>
      <p className="mt-0.5 text-[12px] text-muted">
        {partial?.asOf ? t.partial(formatMoney(partial.amount, currency), formatDate(partial.asOf)) : bankHint}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <MoneyField size="sm" currency={currency} value={value} onValueChange={setValue} className="min-w-0 flex-1" aria-label={t.ariaLabel(noun, formatMonthKey(month))} />
        <Button type="submit" size="sm" variant={value > 0 ? 'primary' : 'secondary'} disabled={value <= 0}>
          {t.save}
        </Button>
      </div>
    </form>
  );
}
