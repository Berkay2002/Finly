import { formatDate, formatMoney, formatMoneyRange, formatPercent } from '@/engine/format';
import { CATEGORY_META, debtName, expenseName } from '@/engine/taxonomy';
import type { ExpenseCategory } from '@/engine/types';
import { useT } from '@/i18n';
import { useAutoAdd } from '@/lib/useAutoAdd';
import { useCurrency, useMetrics, usePlan, useUpcoming } from '@/store/selectors';
import { CommuteCard } from '@/components/everyday/CommuteCard';
import { EverydayCard, SpendMonthCard } from '@/components/everyday/EverydayCards';
import { FoodCard } from '@/components/food/FoodCards';
import { ExpenseEditor } from '@/components/forms/ExpenseEditor';
import { PageHeader } from '@/components/layout/PageHeader';
import { Callout } from '@/components/ui/Callout';
import { Card, CardHeader } from '@/components/ui/Card';
import { CATEGORY_ICON } from '@/components/ui/icons';
import { IconTile } from '@/components/ui/IconTile';
import { StatCard } from '@/components/ui/StatCard';

export function ExpenseSectionPage({ category }: { category: ExpenseCategory }) {
  const t = useT();
  const s = t.bills.section;
  const plan = usePlan();
  const m = useMetrics();
  const currency = useCurrency();
  const autoAdd = useAutoAdd();
  const upcoming = useUpcoming(12).filter((u) => u.category === category).slice(0, 6);
  const meta = CATEGORY_META[category];
  const Icon = CATEGORY_ICON[category];
  const money = (n: number) => formatMoney(n, currency);
  const lineName = (l: { id: string; name: string }) => {
    const item = plan.expenses.find((e) => e.id === l.id);
    return item ? expenseName(item) : l.name;
  };
  const upcomingName = (u: (typeof upcoming)[number]) => {
    if (u.source === 'expense') return lineName({ id: u.expenseId, name: u.name });
    const debt = u.source === 'debt' ? plan.debts?.find((d) => d.id === u.expenseId) : undefined;
    return debt ? debtName(debt) : u.name;
  };

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
          label={s.monthlyCost}
          value={money(total)}
          sub={
            ranged
              ? s.usually(formatMoneyRange(range.low, range.high, currency))
              : m.income.total > 0
                ? s.ofIncome(formatPercent(share))
                : s.perYearAmount(money(total * 12))
          }
        />
        <StatCard icon="card-expensive-months" accent="blue" label={s.perYear} value={money(total * 12)} sub={s.items(lines.length)} />
        <StatCard
          icon="goal-shield"
          accent="green"
          label={s.essential}
          value={money(essential)}
          sub={total > 0 ? s.ofSection(formatPercent(essential / total)) : undefined}
        />
        <StatCard
          icon="nav-finance"
          accent="orange"
          label={s.committed}
          value={money(committed)}
          sub={total > 0 ? s.flexible(money(total - committed)) : undefined}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader title={s.yourExpenses} subtitle={s.yourExpensesSubtitle} />
          <ExpenseEditor category={category} autoOpenAdd={autoAdd} />
        </Card>

        <div className="space-y-4 self-start">
          {category === 'living' && (
            <>
              <FoodCard />
              <SpendMonthCard group="food" />
            </>
          )}
          {category === 'transport' && (
            <>
              <CommuteCard />
              <EverydayCard group="transport" subtitle={s.transportSubtitle} />
              <SpendMonthCard group="transport" />
            </>
          )}
          {category === 'leisure' && (
            <>
              <EverydayCard group="leisure" subtitle={s.leisureSubtitle} />
              <SpendMonthCard group="leisure" />
            </>
          )}
          {category === 'finance' && (
            <Card>
              <CardHeader
                title={s.loans}
                subtitle={s.loansSubtitle}
                icon={<IconTile icon="stat-bank" accent="red" size="sm" />}
                action={m.hasDebts ? s.viewLoans : s.addLoan}
                actionTo={m.hasDebts ? '/loans' : '/loans?add=1'}
              />
              {m.hasDebts && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-page p-3">
                    <div className="text-[11.5px] text-muted">{s.paymentsPerMonth}</div>
                    <div className="tabular text-[18px] font-semibold text-ink">{money(m.debt.monthly)}</div>
                  </div>
                  <div className="rounded-xl bg-page p-3">
                    <div className="text-[11.5px] text-muted">{s.totalOwed}</div>
                    <div className="tabular text-[18px] font-semibold text-ink">{money(m.debt.balance)}</div>
                  </div>
                </div>
              )}
            </Card>
          )}
          {category === 'transport' && m.car.monthly > 0 && (
            <Card>
              <CardHeader title={s.carCost} subtitle={m.car.loans.length > 0 ? s.carCostWithLoans : s.carCostItems} icon={<IconTile icon="card-car-cost" accent="orange" size="sm" />} />
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-page p-3">
                  <div className="text-[11.5px] text-muted">{s.perMonth}</div>
                  <div className="tabular text-[18px] font-semibold text-ink">{money(m.car.monthly)}</div>
                </div>
                <div className="rounded-xl bg-page p-3">
                  <div className="text-[11.5px] text-muted">{s.perYear}</div>
                  <div className="tabular text-[18px] font-semibold text-ink">{money(m.car.annual)}</div>
                </div>
              </div>
            </Card>
          )}
          {category === 'leisure' && m.subscriptions.monthly > 0 && (
            <Card>
              <CardHeader title={s.subscriptions} subtitle={s.subscriptionsSubtitle} icon={<IconTile icon="card-subscriptions" accent="purple" size="sm" />} />
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-page p-3">
                  <div className="text-[11.5px] text-muted">{s.perMonth}</div>
                  <div className="tabular text-[18px] font-semibold text-ink">{money(m.subscriptions.monthly)}</div>
                </div>
                <div className="rounded-xl bg-page p-3">
                  <div className="text-[11.5px] text-muted">{s.perYear}</div>
                  <div className="tabular text-[18px] font-semibold text-ink">{money(m.subscriptions.annual)}</div>
                </div>
              </div>
            </Card>
          )}

          {largest.length > 0 && (
            <Card>
              <CardHeader title={s.largest} />
              <ol className="space-y-2">
                {largest.map((l, i) => (
                  <li key={l.id} className="flex items-center gap-3 text-[13px]">
                    <span className="w-4 text-right text-muted">{i + 1}.</span>
                    <span className="min-w-0 flex-1 truncate text-ink">{lineName(l)}</span>
                    <span className="tabular font-medium text-ink">{money(l.monthly)}</span>
                    <span className="tabular w-24 shrink-0 whitespace-nowrap text-right text-[12px] text-muted">{s.perYearShort(money(l.annual))}</span>
                  </li>
                ))}
              </ol>
            </Card>
          )}

          {upcoming.length > 0 && (
            <Card>
              <CardHeader title={s.comingUp} icon={<IconTile icon="card-upcoming" accent="blue" size="sm" />} />
              <ul className="divide-y divide-line">
                {upcoming.map((u) => (
                  <li key={u.id} className="flex items-center justify-between py-2 text-[13px]">
                    <div>
                      <div className="font-medium text-ink">{upcomingName(u)}</div>
                      <div className="text-[12px] text-muted">{formatDate(u.date)}</div>
                    </div>
                    <div className="tabular font-semibold text-ink">{money(u.amount)}</div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {category === 'planned' && (
            <Callout tone="tip" title={s.spreadTitle}>
              {s.spreadBody}
            </Callout>
          )}
        </div>
      </div>
    </div>
  );
}
