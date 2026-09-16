import { formatDate, formatMoney, formatMoneyRange, formatPercent } from '@/engine/format';
import { CATEGORY_META } from '@/engine/taxonomy';
import type { ExpenseCategory } from '@/engine/types';
import { useAutoAdd } from '@/lib/useAutoAdd';
import { useCurrency, useMetrics, useUpcoming } from '@/store/selectors';
import { FoodCard, FoodMonthCard } from '@/components/food/FoodCards';
import { ExpenseEditor } from '@/components/forms/ExpenseEditor';
import { PageHeader } from '@/components/layout/PageHeader';
import { Callout } from '@/components/ui/Callout';
import { Card, CardHeader } from '@/components/ui/Card';
import { CATEGORY_ICON } from '@/components/ui/icons';
import { IconTile } from '@/components/ui/IconTile';
import { StatCard } from '@/components/ui/StatCard';

export function ExpenseSectionPage({ category }: { category: ExpenseCategory }) {
  const m = useMetrics();
  const currency = useCurrency();
  const autoAdd = useAutoAdd();
  const upcoming = useUpcoming(12).filter((u) => u.category === category).slice(0, 6);
  const meta = CATEGORY_META[category];
  const Icon = CATEGORY_ICON[category];
  const money = (n: number) => formatMoney(n, currency);

  const lines = m.expenses.lines.filter((l) => l.category === category);
  const total = m.expenses.byCategory[category];
  const essential = lines.filter((l) => l.essential).reduce((a, l) => a + l.monthly, 0);
  const committed = lines.filter((l) => l.committed).reduce((a, l) => a + l.monthly, 0);
  const share = m.income.total > 0 ? total / m.income.total : 0;
  const largest = [...lines].sort((a, b) => b.monthly - a.monthly).slice(0, 5);
  const range = m.range.byCategory[category];
  const ranged = range.high > range.low;

  return (
    <div>
      <PageHeader title={meta.label} subtitle={meta.description} />

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          icon={Icon}
          accent={meta.accent}
          label="Monthly cost"
          value={money(total)}
          sub={
            ranged
              ? `Usually ${formatMoneyRange(range.low, range.high, currency)}`
              : m.income.total > 0
                ? `${formatPercent(share)} of income`
                : `${money(total * 12)} per year`
          }
        />
        <StatCard icon="card-expensive-months" accent="blue" label="Per year" value={money(total * 12)} sub={`${lines.length} item${lines.length === 1 ? '' : 's'}`} />
        <StatCard
          icon="goal-shield"
          accent="green"
          label="Essential"
          value={money(essential)}
          sub={total > 0 ? `${formatPercent(essential / total)} of this section` : undefined}
        />
        <StatCard
          icon="nav-finance"
          accent="orange"
          label="Committed"
          value={money(committed)}
          sub={total > 0 ? `${money(total - committed)} flexible` : undefined}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader title="Your expenses" subtitle="Tap a row to change how it is classified." />
          <ExpenseEditor category={category} autoOpenAdd={autoAdd} />
        </Card>

        <div className="space-y-4 self-start">
          {category === 'living' && (
            <>
              <FoodCard />
              <FoodMonthCard />
            </>
          )}
          {category === 'finance' && (
            <Card>
              <CardHeader
                title="Loans"
                subtitle="CSN, mortgage, car loans and credit have their own page, with balance, rate and payoff."
                icon={<IconTile icon="stat-bank" accent="red" size="sm" />}
                action={m.hasDebts ? 'View loans' : 'Add a loan'}
                actionTo={m.hasDebts ? '/loans' : '/loans?add=1'}
              />
              {m.hasDebts && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-page p-3">
                    <div className="text-[11.5px] text-muted">Payments per month</div>
                    <div className="tabular text-[18px] font-semibold text-ink">{money(m.debt.monthly)}</div>
                  </div>
                  <div className="rounded-xl bg-page p-3">
                    <div className="text-[11.5px] text-muted">Total owed</div>
                    <div className="tabular text-[18px] font-semibold text-ink">{money(m.debt.balance)}</div>
                  </div>
                </div>
              )}
            </Card>
          )}
          {category === 'transport' && m.car.monthly > 0 && (
            <Card>
              <CardHeader title="True car cost" subtitle={m.car.loans.length > 0 ? 'Car-tagged items and car loans combined.' : 'All car-tagged items combined.'} icon={<IconTile icon="card-car-cost" accent="orange" size="sm" />} />
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-page p-3">
                  <div className="text-[11.5px] text-muted">Per month</div>
                  <div className="tabular text-[18px] font-semibold text-ink">{money(m.car.monthly)}</div>
                </div>
                <div className="rounded-xl bg-page p-3">
                  <div className="text-[11.5px] text-muted">Per year</div>
                  <div className="tabular text-[18px] font-semibold text-ink">{money(m.car.annual)}</div>
                </div>
              </div>
            </Card>
          )}
          {category === 'leisure' && m.subscriptions.monthly > 0 && (
            <Card>
              <CardHeader title="Subscriptions" subtitle="All subscription-tagged items." icon={<IconTile icon="card-subscriptions" accent="purple" size="sm" />} />
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-page p-3">
                  <div className="text-[11.5px] text-muted">Per month</div>
                  <div className="tabular text-[18px] font-semibold text-ink">{money(m.subscriptions.monthly)}</div>
                </div>
                <div className="rounded-xl bg-page p-3">
                  <div className="text-[11.5px] text-muted">Per year</div>
                  <div className="tabular text-[18px] font-semibold text-ink">{money(m.subscriptions.annual)}</div>
                </div>
              </div>
            </Card>
          )}

          {largest.length > 0 && (
            <Card>
              <CardHeader title="Largest in this section" />
              <ol className="space-y-2">
                {largest.map((l, i) => (
                  <li key={l.id} className="flex items-center gap-3 text-[13px]">
                    <span className="w-4 text-right text-muted">{i + 1}.</span>
                    <span className="min-w-0 flex-1 truncate text-ink">{l.name}</span>
                    <span className="tabular font-medium text-ink">{money(l.monthly)}</span>
                    <span className="tabular w-24 shrink-0 whitespace-nowrap text-right text-[12px] text-muted">{money(l.annual)}/yr</span>
                  </li>
                ))}
              </ol>
            </Card>
          )}

          {upcoming.length > 0 && (
            <Card>
              <CardHeader title="Coming up" icon={<IconTile icon="card-upcoming" accent="blue" size="sm" />} />
              <ul className="divide-y divide-line">
                {upcoming.map((u) => (
                  <li key={u.id} className="flex items-center justify-between py-2 text-[13px]">
                    <div>
                      <div className="font-medium text-ink">{u.name}</div>
                      <div className="text-[12px] text-muted">{formatDate(u.date)}</div>
                    </div>
                    <div className="tabular font-semibold text-ink">{money(u.amount)}</div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {category === 'planned' && (
            <Callout tone="tip" title="Why spread irregular costs?">
              A 12,000 holiday is 1,000 per month. Provisioning like this keeps expensive months from surprising you.
            </Callout>
          )}
        </div>
      </div>
    </div>
  );
}
