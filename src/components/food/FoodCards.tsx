import { useState } from 'react';
import clsx from 'clsx';
import { amountForMonthly } from '@/engine/everyday';
import { formatMoney, formatPercent } from '@/engine/format';
import { suggestionBySlug } from '@/engine/taxonomy';
import { usePlanStore } from '@/store/planStore';
import { useCurrency, useMetrics, usePlan } from '@/store/selectors';
import { SpendNudges, SpendTiles } from '@/components/everyday/EverydayCards';
import { fromSuggestion } from '@/components/forms/ExpenseEditor';
import { HouseholdFoodEstimator } from '@/components/forms/HouseholdFood';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { IconTile } from '@/components/ui/IconTile';
import { ACCENT } from '@/components/ui/accent';
import { SplitBar } from '@/components/ui/ProgressBar';
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
          <SpendTiles summary={f} currency={currency} />

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

          <SpendNudges nudges={f.nudges} currency={currency} />
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
