import { useState } from 'react';
import clsx from 'clsx';
import { monthlySpread } from '@/engine/amounts';
import { amountForMonthly, gapTarget, SPEND_GROUP_META, spendEntryFor, spendHistory, type SpendNudge, type SpendSummary } from '@/engine/everyday';
import { formatDate, formatMoney, formatMonthKey } from '@/engine/format';
import { monthKeyOf } from '@/engine/metrics';
import type { SpendGroup } from '@/engine/types';
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

/** Per month, week and day, and the normal spread. */
export function SpendTiles({ summary, currency }: { summary: SpendSummary; currency: string }) {
  const money = (n: number) => formatMoney(n, currency);
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Per month', value: summary.monthly },
          { label: 'Per week', value: summary.weekly },
          { label: 'Per day', value: summary.daily },
        ].map((t) => (
          <div key={t.label} className="min-w-0 rounded-xl bg-page px-2.5 py-2">
            <div className="text-[11.5px] text-muted">{t.label}</div>
            <div className="tabular whitespace-nowrap text-[14px] font-semibold text-ink">{money(t.value)}</div>
          </div>
        ))}
      </div>
      {summary.high > summary.low && (
        <p className="tabular mt-2 text-[12px] text-muted">
          A normal month lands between {money(summary.low)} and {money(summary.high)}.
        </p>
      )}
    </>
  );
}

/** "One fewer a week saves …", with a button that plans for it. */
export function SpendNudges({ nudges, currency }: { nudges: SpendNudge[]; currency: string }) {
  const plan = usePlan();
  const updateExpense = usePlanStore((s) => s.updateExpense);
  const money = (n: number) => formatMoney(n, currency);
  if (nudges.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-faint">Small changes</div>
      <ul className="divide-y divide-line">
        {nudges.slice(0, 3).map((n) => (
          <li key={n.id} className="flex items-center gap-3 py-2 text-[13px]">
            <div className="min-w-0 flex-1">
              <div className="text-ink">
                {n.name}: one fewer a {n.per}
              </div>
              <div className="tabular text-[12px] text-muted">
                saves {money(n.monthly)} a month · {money(n.monthly * 12)} a year
              </div>
            </div>
            <Button
              size="sm"
              variant="soft"
              onClick={() => {
                const e = plan.expenses.find((x) => x.id === n.id);
                if (e?.occurrences) updateExpense(n.id, { occurrences: { ...e.occurrences, times: Math.max(0, e.occurrences.times - 1) } });
              }}
              title={`Plan for ${n.times - 1} a ${n.per} instead of ${n.times}`}
            >
              {n.times - 1 > 0 ? `${n.times - 1}× a ${n.per}` : 'Drop it'}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Everyday spending in a section broken down per week and day. Food has its own card with more. */
export function EverydayCard({ group, subtitle }: { group: Exclude<SpendGroup, 'food'>; subtitle: string }) {
  const m = useMetrics();
  const currency = useCurrency();
  const g = m.everyday[group];
  if (g.monthly <= 0) return null;
  const look = GROUP_LOOK[group];
  return (
    <Card>
      <CardHeader icon={<IconTile icon={look.icon} accent={look.accent} size="sm" />} title={SPEND_GROUP_META[group].label} subtitle={subtitle} />
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
  const title = group === 'food' ? 'Food' : meta.label;

  return (
    <Card>
      <CardHeader
        icon={<IconTile icon={group === 'food' ? 'card-per-day' : look.icon} accent={look.accent} size="sm" />}
        title={running ? `${title} this month` : `${title} in ${formatMonthKey(key)}`}
        subtitle={
          running
            ? `Now and then, type in what your bank app says you have spent on ${meta.noun} so far.`
            : 'The total for the month, from your bank app.'
        }
      />

      <MoneyField
        label={running ? 'Spent so far' : 'Spent in total'}
        hint={running && sm.spent !== undefined && sm.day < today.getDate() ? `(updated ${formatDate(`${key}-${String(sm.day).padStart(2, '0')}`)})` : undefined}
        currency={currency}
        value={sm.spent ?? 0}
        onValueChange={(amount) =>
          setEverydaySpend(group, key, amount > 0 ? (running ? { amount, asOf: isoToday } : { amount }) : null)
        }
      />

      {sm.spent !== undefined && g.monthly > 0 && (
        <div className="mt-3">
          <ProgressBar value={sm.spent / g.monthly} accent={over ? 'orange' : 'green'} />
          <dl className="mt-2 space-y-1 text-[12.5px]">
            {!sm.complete && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted">
                  Day {sm.day} of {sm.daysInMonth}, expected by now
                </dt>
                <dd className="tabular text-ink">{money(sm.expectedByNow)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{sm.complete ? 'Planned' : 'Planned for the month'}</dt>
              <dd className="tabular text-ink">{money(g.monthly)}</dd>
            </div>
            {sm.projected !== undefined && sm.variance !== undefined && (
              <div className="flex justify-between gap-3">
                <dt className="font-medium text-ink">{sm.complete ? 'Against plan' : 'At this pace'}</dt>
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
                ? `${money(sm.left)} left: ${money(sm.leftPerDay ?? 0)} a day for the ${sm.daysInMonth - sm.day} days to go.`
                : `${money(-sm.left)} over the month's plan already.`}
            </p>
          )}
          {sm.complete && frozen && (
            <p className="mt-2 text-[12px] text-muted">The closed month now runs on this figure instead of the estimates.</p>
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
            <span className="font-medium text-ink-soft">Your months</span>
            {history.basedOn >= 2 && (
              <span className="tabular text-muted">
                avg {money(history.average)} over {history.basedOn}
              </span>
            )}
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {history.months.slice(0, 6).map((x) => (
              <li key={x.month} className="tabular rounded-md bg-page px-2 py-1 text-[11.5px] text-ink-soft">
                {formatMonthKey(x.month)}: <span className="font-medium text-ink">{money(x.amount)}</span>
              </li>
            ))}
          </ul>
          {history.gap !== null && (
            <div className="mt-2.5 rounded-lg bg-orange-100/70 px-3 py-2 text-[12px] text-orange-800">
              <p>
                Your last {history.basedOn} months averaged <span className="tabular font-semibold">{money(history.average)}</span>; the plan
                says <span className="tabular font-semibold">{money(g.monthly)}</span>.
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
                  {history.gap > 0 ? 'Add' : 'Take'} {money(Math.abs(history.gap))} a month {history.gap > 0 ? 'to' : 'off'} {target.name.toLowerCase()}
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
  return (
    <form
      className="mt-4 rounded-xl border border-dashed border-line bg-page/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (value > 0) onSave(value);
      }}
    >
      <div className="text-[13px] font-medium text-ink">
        What did you spend on {noun} in {formatMonthKey(month)}?
      </div>
      <p className="mt-0.5 text-[12px] text-muted">
        {partial?.asOf ? `You logged ${formatMoney(partial.amount, currency)} by ${formatDate(partial.asOf)}. Enter the full month.` : bankHint}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <MoneyField size="sm" currency={currency} value={value} onValueChange={setValue} className="min-w-0 flex-1" aria-label={`Spent on ${noun} in ${formatMonthKey(month)}`} />
        <Button type="submit" size="sm" variant={value > 0 ? 'primary' : 'secondary'} disabled={value <= 0}>
          Save
        </Button>
      </div>
    </form>
  );
}
