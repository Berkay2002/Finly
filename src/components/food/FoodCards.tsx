import { useState } from 'react';
import clsx from 'clsx';
import { amountForMonthly, foodHistory, spendEntryFor } from '@/engine/food';
import { formatDate, formatMoney, formatMonthKey, formatPercent } from '@/engine/format';
import { monthlySpread } from '@/engine/amounts';
import { monthKeyOf } from '@/engine/metrics';
import { suggestionBySlug } from '@/engine/taxonomy';
import { usePlanStore } from '@/store/planStore';
import { useCurrency, useFrozenMonth, useMetrics, usePlan } from '@/store/selectors';
import { fromSuggestion } from '@/components/forms/ExpenseEditor';
import { HouseholdFoodEstimator } from '@/components/forms/HouseholdFood';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { MoneyField } from '@/components/ui/fields';
import { IconTile } from '@/components/ui/IconTile';
import { ACCENT } from '@/components/ui/accent';
import { ProgressBar, SplitBar } from '@/components/ui/ProgressBar';
import { Sheet } from '@/components/ui/Sheet';

/**
 * Food & drink broken down: per month, week and day, at home vs eating out, and the small changes
 * that would free up the most. Shown on the Living Costs page.
 */
export function FoodCard() {
  const m = useMetrics();
  const plan = usePlan();
  const currency = useCurrency();
  const { addExpense, updateExpense } = usePlanStore();
  const [estimating, setEstimating] = useState(false);
  const f = m.food;
  const money = (n: number) => formatMoney(n, currency);
  const groceries = plan.expenses.find((e) => e.subcategory === 'groceries' && !e.includedElsewhere);
  const hasLunches = plan.expenses.some((e) => e.subcategory === 'work_lunches');

  const applyEstimate = (monthly: number, adultsLunchingOut: number) => {
    if (groceries) {
      updateExpense(groceries.id, { amount: amountForMonthly(groceries, monthly) });
    } else {
      const draft = fromSuggestion(suggestionBySlug('groceries')!);
      addExpense({ ...draft, amount: amountForMonthly(draft, monthly) });
    }
    if (adultsLunchingOut > 0 && !hasLunches) {
      const lunches = fromSuggestion(suggestionBySlug('work_lunches')!);
      addExpense({ ...lunches, occurrences: { times: 5 * adultsLunchingOut, per: 'week' } });
    }
    setEstimating(false);
  };

  return (
    <Card>
      <CardHeader
        icon={<IconTile icon="nav-living" accent="green" size="sm" />}
        title="Food & drink"
        subtitle="Groceries and eating out, in the units you actually spend in."
      />
      {f.monthly > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Per month', value: f.monthly },
              { label: 'Per week', value: f.weekly },
              { label: 'Per day', value: f.daily },
            ].map((t) => (
              <div key={t.label} className="min-w-0 rounded-xl bg-page px-2.5 py-2">
                <div className="text-[11.5px] text-muted">{t.label}</div>
                <div className="tabular whitespace-nowrap text-[14px] font-semibold text-ink">{money(t.value)}</div>
              </div>
            ))}
          </div>
          {f.high > f.low && (
            <p className="tabular mt-2 text-[12px] text-muted">
              A normal month lands between {money(f.low)} and {money(f.high)}.
            </p>
          )}

          {f.atHome > 0 && f.eatingOut > 0 && (
            <div className="mt-3">
              <SplitBar a={f.atHome} b={f.eatingOut} accentA="green" accentB="orange" />
              <div className="mt-1.5 flex justify-between gap-3 text-[12px]">
                <span className="text-ink-soft">
                  <span className={clsx('mr-1 inline-block h-2 w-2 rounded-full align-middle', ACCENT.green.dot)} />
                  At home <span className="tabular text-ink">{money(f.atHome)}</span>
                </span>
                <span className="text-ink-soft">
                  <span className={clsx('mr-1 inline-block h-2 w-2 rounded-full align-middle', ACCENT.orange.dot)} />
                  Eating out <span className="tabular text-ink">{money(f.eatingOut)}</span>
                  <span className="ml-1 text-muted">({formatPercent(f.eatingOutShare)})</span>
                </span>
              </div>
            </div>
          )}

          {f.nudges.length > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-faint">Small changes</div>
              <ul className="divide-y divide-line">
                {f.nudges.slice(0, 3).map((n) => (
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
          )}
        </>
      ) : (
        <p className="text-[13px] text-muted">
          No food costs yet. Start from what a household like yours needs, then add what you spend eating out.
        </p>
      )}

      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="secondary" onClick={() => setEstimating(true)}>
          {groceries ? 'Re-estimate groceries' : 'Estimate groceries'}
        </Button>
      </div>

      <Sheet
        open={estimating}
        onClose={() => setEstimating(false)}
        title="Estimate groceries"
        subtitle="From Konsumentverket's food costs for your household"
      >
        <HouseholdFoodEstimator
          currency={currency}
          applyLabel={(monthly) => {
            const target = groceries ?? fromSuggestion(suggestionBySlug('groceries')!);
            const noun = target.occurrences ? 'each time' : target.frequency === 'weekly' ? 'a week' : 'a month';
            return `${groceries ? 'Set' : 'Add'} groceries to ${money(amountForMonthly(target, monthly))} ${noun}`;
          }}
          onApply={applyEstimate}
          onCancel={() => setEstimating(false)}
        />
      </Sheet>
    </Card>
  );
}

/**
 * What was really spent on food. Everyday spending has no invoice, so the month gets one total read
 * off the bank app: part-way through for the pace, in full afterwards to compare with the plan.
 */
export function FoodMonthCard() {
  const m = useMetrics();
  const plan = usePlan();
  const currency = useCurrency();
  const { key, frozen } = useFrozenMonth();
  const { setFoodSpend, updateExpense } = usePlanStore();
  const f = m.food;
  const fm = f.month;
  const money = (n: number) => formatMoney(n, currency);

  const today = new Date();
  const todayKey = monthKeyOf(today);
  const running = key === todayKey;
  const prevKey = monthKeyOf(new Date(today.getFullYear(), today.getMonth() - 1, 1));
  const prevEntry = spendEntryFor(plan.foodSpend, prevKey);
  const createdKey = monthKeyOf(new Date(plan.createdAt));
  const askPrev = running && f.monthly > 0 && (!prevEntry || prevEntry.asOf) && createdKey <= prevKey;
  // The frozen copy of a closed month only keeps that month, so history comes from the live plan.
  const history = foodHistory(plan.foodSpend, running ? key : todayKey, f.monthly);
  const groceries = plan.expenses.find((e) => e.subcategory === 'groceries' && !e.includedElsewhere);

  if (key > todayKey || (f.monthly <= 0 && fm.spent === undefined)) return null;

  const isoToday = `${todayKey}-${String(today.getDate()).padStart(2, '0')}`;
  const over = (fm.spent ?? 0) > fm.expectedByNow;

  return (
    <Card>
      <CardHeader
        icon={<IconTile icon="card-per-day" accent="green" size="sm" />}
        title={running ? 'Food this month' : `Food in ${formatMonthKey(key)}`}
        subtitle={
          running
            ? 'Now and then, type in what your bank app says you have spent on food so far.'
            : 'The total for the month, from your bank app.'
        }
      />

      <MoneyField
        label={running ? 'Spent so far' : 'Spent in total'}
        hint={running && fm.spent !== undefined && fm.day < today.getDate() ? `(updated ${formatDate(`${key}-${String(fm.day).padStart(2, '0')}`)})` : undefined}
        currency={currency}
        value={fm.spent ?? 0}
        onValueChange={(amount) =>
          setFoodSpend(key, amount > 0 ? (running ? { amount, asOf: isoToday } : { amount }) : null)
        }
      />

      {fm.spent !== undefined && f.monthly > 0 && (
        <div className="mt-3">
          <ProgressBar value={fm.spent / f.monthly} accent={over ? 'orange' : 'green'} />
          <dl className="mt-2 space-y-1 text-[12.5px]">
            {!fm.complete && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted">
                  Day {fm.day} of {fm.daysInMonth}, expected by now
                </dt>
                <dd className="tabular text-ink">{money(fm.expectedByNow)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{fm.complete ? 'Planned' : 'Planned for the month'}</dt>
              <dd className="tabular text-ink">{money(f.monthly)}</dd>
            </div>
            {fm.projected !== undefined && fm.variance !== undefined && (
              <div className="flex justify-between gap-3">
                <dt className="font-medium text-ink">{fm.complete ? 'Against plan' : 'At this pace'}</dt>
                <dd className={clsx('tabular font-semibold', fm.variance > 0 ? 'text-warning' : 'text-positive')}>
                  {!fm.complete && `${money(fm.projected)} · `}
                  {formatMoney(fm.variance, currency, { sign: true })}
                </dd>
              </div>
            )}
          </dl>
          {!fm.complete && fm.left !== undefined && (
            <p className="tabular mt-2 text-[12.5px] text-muted">
              {fm.left > 0
                ? `${money(fm.left)} left: ${money(fm.leftPerDay ?? 0)} a day for the ${fm.daysInMonth - fm.day} days to go.`
                : `${money(-fm.left)} over the month's plan already.`}
            </p>
          )}
          {fm.complete && frozen && (
            <p className="mt-2 text-[12px] text-muted">The closed month now runs on this figure instead of the estimates.</p>
          )}
        </div>
      )}

      {askPrev && <PreviousMonthPrompt month={prevKey} partial={prevEntry} currency={currency} onSave={(amount) => setFoodSpend(prevKey, { amount })} />}

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
                says <span className="tabular font-semibold">{money(f.monthly)}</span>.
              </p>
              {groceries && (
                <Button
                  size="sm"
                  variant="soft"
                  className="mt-2"
                  onClick={() => {
                    const current = monthlySpread(groceries).typical;
                    updateExpense(groceries.id, { amount: amountForMonthly(groceries, Math.max(0, current + history.gap!)) });
                  }}
                >
                  {history.gap > 0 ? 'Add' : 'Take'} {money(Math.abs(history.gap))} a month {history.gap > 0 ? 'to' : 'off'} groceries
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
  partial,
  currency,
  onSave,
}: {
  month: string;
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
      <div className="text-[13px] font-medium text-ink">What did you spend on food in {formatMonthKey(month)}?</div>
      <p className="mt-0.5 text-[12px] text-muted">
        {partial?.asOf
          ? `You logged ${formatMoney(partial.amount, currency)} by ${formatDate(partial.asOf)}. Enter the full month.`
          : 'Most bank apps total this under a food or groceries category.'}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <MoneyField size="sm" currency={currency} value={value} onValueChange={setValue} className="min-w-0 flex-1" aria-label={`Food in ${formatMonthKey(month)}`} />
        <Button type="submit" size="sm" variant={value > 0 ? 'primary' : 'secondary'} disabled={value <= 0}>
          Save
        </Button>
      </div>
    </form>
  );
}
