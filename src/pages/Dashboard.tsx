import { ArrowRight } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import clsx from 'clsx';
import { formatDate, formatMoney, formatMonthYear, formatMonths, formatPercent } from '@/engine/format';
import { goalProgress } from '@/engine/projections';
import { CATEGORY_META } from '@/engine/taxonomy';
import { EXPENSE_CATEGORIES } from '@/engine/types';
import { CATEGORY_ROUTE } from '@/nav';
import { useCurrency, useMetrics, usePlan, usePreviousSnapshot, useUpcoming, useViewDate } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';
import { useExpenseSheet } from '@/components/forms/ExpenseEditor';
import { useGoalSheet } from '@/components/forms/GoalEditor';
import { PageHeader } from '@/components/layout/PageHeader';
import { Callout } from '@/components/ui/Callout';
import { Card, CardHeader } from '@/components/ui/Card';
import { DeltaOr } from '@/components/ui/Delta';
import { DonutBreakdown, type DonutSlice } from '@/components/ui/Donut';
import { EditableRow, EditableTitle } from '@/components/ui/EditableRow';
import { CATEGORY_ICON, goalAccent, goalIcon } from '@/components/ui/icons';
import { IconTile } from '@/components/ui/IconTile';
import { ProgressBar, SplitBar } from '@/components/ui/ProgressBar';
import { StatCard } from '@/components/ui/StatCard';
import { LinkButton } from '@/components/ui/Button';

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function Dashboard() {
  const plan = usePlan();
  const m = useMetrics();
  const currency = useCurrency();
  const prev = usePreviousSnapshot();
  const upcoming = useUpcoming(12).slice(0, 4);
  const now = useViewDate();
  const viewMonth = useUiStore((s) => s.viewMonth);
  const money = (n: number) => formatMoney(n, currency);
  // Goals and upcoming expenses can be edited right here instead of on their own pages.
  const expenses = useExpenseSheet();
  const goalSheet = useGoalSheet();

  const isEmpty = !m.hasIncome && !m.hasExpenses && !m.hasAccounts && !m.hasGoals;
  if (isEmpty && !plan.onboarding.completed) return <Navigate to="/welcome" replace />;

  const slices: DonutSlice[] = EXPENSE_CATEGORIES.map((c) => ({
    key: c,
    label: CATEGORY_META[c].shortLabel,
    value: m.expenses.byCategory[c],
    accent: CATEGORY_META[c].accent,
  }));

  const goals = plan.goals.filter((g) => g.targetAmount).slice(0, 4);
  const name = plan.userName.trim();

  return (
    <div>
      <PageHeader
        title={name ? `${greeting(new Date())}, ${name}` : greeting(new Date())}
        subtitle={`Here's your financial overview for ${formatMonthYear(viewMonth)}.`}
      />

      {isEmpty && (
        <Callout
          tone="tip"
          title="Your plan is empty"
          className="mb-5"
          action={
            <LinkButton to="/onboarding/income" size="sm" iconRight={ArrowRight}>
              Start planning
            </LinkButton>
          }
        >
          Add your income and expenses to bring this dashboard to life.
        </Callout>
      )}

      {/* Primary overview */}
      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatCard
          icon="stat-safe-to-spend"
          accent="brand"
          label="Safe to spend"
          value={money(m.safeToSpend)}
          sub={m.oneOffsThisMonth > 0 ? `After ${money(m.oneOffsThisMonth)} of one-off costs` : 'Available this month'}
          className={clsx('col-span-2 xl:col-span-1', m.safeToSpend < 0 && 'border-orange-500/40')}
        />
        <StatCard
          icon="stat-income"
          accent="blue"
          label="Total income"
          value={money(m.income.total)}
          sub={<DeltaOr before={prev?.income} after={m.income.total} fallback="Average per month" />}
        />
        <StatCard
          icon="stat-cost"
          accent="red"
          label="Normal monthly cost"
          value={money(m.lifestyleCost)}
          sub={<DeltaOr before={prev?.lifestyleCost} after={m.lifestyleCost} invert fallback={`${money(m.essentialCost)} essential`} />}
        />
        <StatCard
          icon="stat-saving"
          accent="green"
          label="Planned saving & investing"
          value={money(m.savings.total)}
          sub={<DeltaOr before={prev?.savings} after={m.savings.total} fallback={`${formatPercent(m.savings.rate)} of income`} />}
        />
        <StatCard
          icon="stat-bank"
          accent="indigo"
          label="Current bank balance"
          value={money(m.position.cashInBank)}
          sub={<DeltaOr before={prev?.cashInBank} after={m.position.cashInBank} fallback="All cash accounts combined" />}
        />
      </div>

      {/* Spending · Position · Goals */}
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="Where your money goes"
            subtitle={
              <>
                <span className="tabular font-semibold text-ink">{money(m.lifestyleCost)}</span> / month
              </>
            }
            action="View all expenses"
            actionTo="/insights"
          />
          {m.hasExpenses ? (
            <DonutBreakdown
              slices={slices}
              currency={currency}
              center={
                <>
                  <span className="tabular text-[16px] font-bold leading-tight text-ink">{formatMoney(m.lifestyleCost, '')}</span>
                  <span className="text-[11px] text-muted">{currency}</span>
                </>
              }
            />
          ) : (
            <p className="text-[13px] text-muted">Add expenses to see the breakdown.</p>
          )}
        </Card>

        <Card>
          <CardHeader title="Your financial position" action="View accounts" actionTo="/accounts" />
          <ul className="divide-y divide-line">
            {[
              { icon: 'account-everyday' as const, accent: 'blue' as const, label: 'Everyday money', value: m.position.everyday },
              { icon: 'account-savings' as const, accent: 'purple' as const, label: 'Savings', value: m.position.cashSavings },
              { icon: 'account-emergency' as const, accent: 'yellow' as const, label: 'Emergency fund', value: m.position.emergency },
              { icon: 'account-investment' as const, accent: 'green' as const, label: 'Investments', value: m.position.investments },
            ].map((r) => (
              <li key={r.label} className="flex items-center gap-3 py-2.5">
                <IconTile icon={r.icon} accent={r.accent} size="sm" />
                <span className="flex-1 text-[13.5px] text-ink-soft">{r.label}</span>
                <span className="tabular text-[13.5px] font-medium text-ink">{money(r.value)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-line pt-3">
            <span className="text-[14px] font-semibold text-ink">Total assets</span>
            <span className="tabular text-[16px] font-bold text-ink">{money(m.position.totalAssets)}</span>
          </div>
        </Card>

        <Card>
          <CardHeader icon={<IconTile icon="card-goals" accent="brand" size="sm" />} title="Savings & goals" action="View all" actionTo="/savings" />
          {goals.length === 0 ? (
            <p className="text-[13px] text-muted">
              {plan.goals.length > 0 ? 'Add a target amount to a goal to track progress here.' : 'No goals yet.'}{' '}
              <Link to="/savings" className="font-medium text-brand-700">
                Manage goals
              </Link>
            </p>
          ) : (
            <ul className="space-y-1">
              {goals.map((g) => {
                const p = goalProgress(g, now);
                return (
                  <li key={g.id}>
                    <EditableRow onClick={() => goalSheet.openEdit(g.id)} title="Edit goal" className="py-1">
                    <IconTile icon={goalIcon(g.icon, g.kind)} accent={goalAccent(g.icon, g.kind)} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <EditableTitle className="text-[13px] font-medium text-ink">{g.name}</EditableTitle>
                        <span className="tabular text-[12.5px] font-semibold text-brand-700">{formatPercent(p.progress)}</span>
                      </div>
                      <ProgressBar value={p.progress} height="sm" className="mt-1" />
                      <div className="tabular mt-0.5 text-[11.5px] text-muted">
                        {formatMoney(g.currentAmount, '')} / {money(g.targetAmount!)}
                      </div>
                    </div>
                    </EditableRow>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Stability · Upcoming · Runway */}
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader
            icon={<IconTile icon="card-income-stability" accent="green" size="sm" />}
            title="Income stability"
            action="View details"
            actionTo="/income"
          />
          <SplitBar a={m.income.reliable} b={m.income.variable} accentA="brand" accentB="blue" />
          <div className="mt-3 grid grid-cols-2 divide-x divide-line">
            <div>
              <div className="tabular text-[17px] font-semibold text-ink">{money(m.income.reliable)}</div>
              <div className="text-[12px] text-muted">Reliable income</div>
            </div>
            <div className="pl-4">
              <div className="tabular text-[17px] font-semibold text-ink">{money(m.income.variable)}</div>
              <div className="text-[12px] text-muted">Variable income</div>
            </div>
          </div>
          <div className="mt-4">
            {!m.hasExpenses || !m.hasIncome ? (
              <Callout tone="neutral">Add income and expenses to check whether reliable income covers essentials.</Callout>
            ) : m.resilience.reliableCoversEssentials ? (
              <Callout tone="success">Your essential costs are covered by your reliable income.</Callout>
            ) : (
              <Callout tone="warning">
                {money(-m.resilience.essentialMargin)} of your essential costs depends on variable income.
              </Callout>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={<IconTile icon="card-upcoming" accent="blue" size="sm" />}
            title="Upcoming expenses"
            action="View all"
            actionTo="/planning#outlook"
          />
          {upcoming.length === 0 ? (
            <p className="text-[13px] text-muted">
              No irregular expenses with dates yet. Add a next due date to yearly or one-off costs to see them here.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.map((u) => (
                <li key={u.id}>
                  <EditableRow onClick={() => expenses.openEdit(u.expenseId)} title="Edit expense" className="py-2.5">
                  <IconTile icon={CATEGORY_ICON[u.category]} accent={CATEGORY_META[u.category].accent} size="sm" />
                  <div className="min-w-0 flex-1">
                    <EditableTitle className="text-[13.5px] font-medium text-ink">{u.name}</EditableTitle>
                    <div className="text-[12px] text-muted">{formatDate(u.date)}</div>
                  </div>
                  <div className="tabular text-[13.5px] font-semibold text-ink">{money(u.amount)}</div>
                  </EditableRow>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            icon={<IconTile icon="card-income-stopped" accent="purple" size="sm" />}
            title="If your income stopped"
            action="View scenarios"
            actionTo="/planning"
          />
          <div className="grid grid-cols-2 divide-x divide-line">
            <div>
              <div className="tabular text-[22px] font-bold text-ink">{formatMonths(m.resilience.essentialRunwayMonths)}</div>
              <div className="text-[12px] text-muted">Essential expenses</div>
            </div>
            <div className="pl-4">
              <div className="tabular text-[22px] font-bold text-ink">{formatMonths(m.resilience.lifestyleRunwayMonths)}</div>
              <div className="text-[12px] text-muted">Current lifestyle</div>
            </div>
          </div>
          <div className="mt-4">
            <Callout tone="info">
              {m.resilience.availableForRunway > 0 && m.essentialCost > 0
                ? `You could cover your essential costs for ${formatMonths(m.resilience.essentialRunwayMonths)} with ${money(m.resilience.availableForRunway)} of cash and emergency savings.`
                : 'Add cash accounts and expenses to see how long your savings would last.'}
            </Callout>
          </div>
        </Card>
      </div>

      {/* Resilience strip */}
      <Card className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex items-center gap-3 lg:w-[38%]">
          <IconTile icon="card-resilience" accent="green" />
          <div>
            <div className="text-[13px] font-semibold text-ink">Financial resilience</div>
            <div className="tabular text-[22px] font-bold leading-tight text-ink">
              {m.position.emergency > 0 && m.essentialCost > 0 ? formatMonths(m.resilience.emergencyMonths) : '–'}
            </div>
            <div className="text-[12px] text-muted">Emergency fund covers your essential costs</div>
          </div>
        </div>
        <div className="flex-1 lg:border-l lg:border-line lg:pl-5">
          <ResilienceMessage />
        </div>
        <LinkButton to="/insights" variant="secondary" iconRight={ArrowRight} className="self-start lg:self-center">
          View insights
        </LinkButton>
      </Card>

      {expenses.sheet}
      {goalSheet.sheet}

      {/* Quick links for the sections on small screens */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:hidden">
        {EXPENSE_CATEGORIES.map((c) => (
          <Link key={c} to={CATEGORY_ROUTE[c]} className="card flex items-center gap-2.5 p-3">
            <IconTile icon={CATEGORY_ICON[c]} accent={CATEGORY_META[c].accent} size="sm" />
            <div className="min-w-0">
              <div className="truncate text-[12.5px] font-medium text-ink">{CATEGORY_META[c].shortLabel}</div>
              <div className="tabular text-[12px] text-muted">{money(m.expenses.byCategory[c])}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ResilienceMessage() {
  const m = useMetrics();
  const currency = useCurrency();
  const months = m.resilience.emergencyMonths;
  if (!m.hasExpenses) {
    return <Callout tone="neutral">Add your expenses and an emergency account to measure your cushion.</Callout>;
  }
  if (m.position.emergency === 0) {
    return (
      <Callout tone="tip" title="No dedicated emergency fund yet">
        Your cash in bank still gives you {formatMonths(m.resilience.essentialRunwayMonths)} of essential runway.
      </Callout>
    );
  }
  if (months >= 3) {
    return (
      <Callout tone="success" title="You're in a good position">
        Your financial cushion is solid. Keep building towards your goals; {formatMoney(m.breathingRoom, currency)} per month is
        currently unallocated.
      </Callout>
    );
  }
  return (
    <Callout tone="warning" title={`${formatMonths(months)} of essential costs in your emergency fund`}>
      Three months is a common reference point. Your breathing room is {formatMoney(m.breathingRoom, currency)} per month if you
      want to build it faster.
    </Callout>
  );
}
