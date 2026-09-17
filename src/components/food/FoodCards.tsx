import { useState } from 'react';
import clsx from 'clsx';
import { amountForMonthly } from '@/engine/everyday';
import { formatMoney, formatPercent } from '@/engine/format';
import { foodPriceLink } from '@/engine/priceLinks';
import { suggestionBySlug } from '@/engine/taxonomy';
import { useT } from '@/i18n';
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
  const t = useT().everyday.food;
  const money = (n: number) => formatMoney(n, currency);
  const groceries = plan.expenses.find((e) => e.subcategory === 'groceries' && !e.includedElsewhere);
  const hasLunches = plan.expenses.some((e) => e.subcategory === 'work_lunches');

  // The estimate is at `priceMonth`'s prices, so the item follows the food index from there on.
  const applyEstimate = (monthly: number, adultsLunchingOut: number, priceMonth: string) => {
    if (groceries) {
      const amount = amountForMonthly(groceries, monthly);
      updateExpense(groceries.id, { amount, priceLink: foodPriceLink({ amount, range: groceries.range }, priceMonth) });
    } else {
      const draft = fromSuggestion(suggestionBySlug('groceries')!);
      const amount = amountForMonthly(draft, monthly);
      addExpense({ ...draft, amount, priceLink: foodPriceLink({ amount, range: draft.range }, priceMonth) });
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
        title={t.title}
        subtitle={t.subtitle}
      />
      {f.monthly > 0 ? (
        <>
          <SpendTiles summary={f} currency={currency} />

          {f.atHome > 0 && f.eatingOut > 0 && (
            <div className="mt-3">
              <SplitBar a={f.atHome} b={f.eatingOut} accentA="green" accentB="orange" />
              <div className="mt-3 grid grid-cols-2 divide-x divide-line">
                <div>
                  <div className="tabular text-[17px] font-semibold text-ink">{money(f.atHome)}</div>
                  <div className="text-[12px] text-muted">
                    <span className={clsx('mr-1.5 inline-block h-2 w-2 rounded-full align-middle', ACCENT.green.dot)} />
                    {t.atHome}
                  </div>
                </div>
                <div className="pl-4">
                  <div className="tabular text-[17px] font-semibold text-ink">{money(f.eatingOut)}</div>
                  <div className="text-[12px] text-muted">
                    <span className={clsx('mr-1.5 inline-block h-2 w-2 rounded-full align-middle', ACCENT.orange.dot)} />
                    {t.eatingOut} · <span className="tabular">{formatPercent(f.eatingOutShare)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <SpendNudges nudges={f.nudges} currency={currency} />
        </>
      ) : (
        <p className="text-[13px] text-muted">
          {t.empty}
        </p>
      )}

      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="secondary" onClick={() => setEstimating(true)}>
          {groceries ? t.reestimate : t.estimate}
        </Button>
      </div>

      <Sheet
        open={estimating}
        onClose={() => setEstimating(false)}
        size="lg"
        title={t.sheetTitle}
        subtitle={t.sheetSubtitle}
      >
        <HouseholdFoodEstimator
          currency={currency}
          applyLabel={(monthly) => {
            const target = groceries ?? fromSuggestion(suggestionBySlug('groceries')!);
            const per = target.occurrences ? 'each' : target.frequency === 'weekly' ? 'week' : 'month';
            const amount = money(amountForMonthly(target, monthly));
            return groceries ? t.setGroceries(amount, per) : t.addGroceries(amount, per);
          }}
          onApply={applyEstimate}
          onCancel={() => setEstimating(false)}
        />
      </Sheet>
    </Card>
  );
}
