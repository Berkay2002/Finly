import { ArrowRight } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import clsx from 'clsx';
import { formatDate, formatMoney, formatMoneyRange, formatMonthYear, formatMonths, formatPercent } from '@/engine/format';
import { goalProgress, goalReturn } from '@/engine/projections';
import { savingsPots } from '@/engine/savings';
import { CATEGORY_META } from '@/engine/taxonomy';
import { EXPENSE_CATEGORIES } from '@/engine/types';
import { CATEGORY_ROUTE } from '@/nav';
import {
  useAccountReturns,
  useCurrency,
  useEffectivePlan,
  useMetrics,
  usePlan,
  usePreviousSnapshot,
  useUpcoming,
  useViewDate,
} from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';
import { BillsToConfirm } from '@/components/forms/BillsToConfirm';
import { useExpenseSheet } from '@/components/forms/ExpenseEditor';
import { useGoalSheet } from '@/components/forms/GoalEditor';
import { DEBT_ACCENT, DEBT_ICON, useLoanSheet } from '@/components/forms/LoanEditor';
import { useSavingsTaxSheet } from '@/components/forms/SavingsTax';
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
import { messages, useT } from '@/i18n';

function greeting(now: Date): string {
  const t = messages().dashboard.greeting;
  const h = now.getHours();
  if (h < 5) return t.night;
  if (h < 12) return t.morning;
  if (h < 18) return t.afternoon;
  return t.evening;
}

export function Dashboard() {
  const d = useT().dashboard;
  const plan = usePlan();
  const shown = useEffectivePlan();
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
  const loanSheet = useLoanSheet();
  const taxSheet = useSavingsTaxSheet();
  const returns = useAccountReturns();

  const isEmpty = !m.hasIncome && !m.hasExpenses && !m.hasAccounts && !m.hasGoals && !m.hasDebts;
  if (isEmpty && !plan.onboarding.completed) return <Navigate to="/welcome" replace />;

  const slices: DonutSlice[] = EXPENSE_CATEGORIES.map((c) => ({
    key: c,
    label: CATEGORY_META[c].shortLabel,
    value: m.expenses.byCategory[c],
    accent: CATEGORY_META[c].accent,
  }));
  if (m.debt.monthly > 0) slices.push({ key: 'loans', label: d.loans, value: m.debt.monthly, accent: 'red' });

  const pots = savingsPots(shown);
  const goals = pots.filter((g) => g.targetAmount).slice(0, 4);
  const name = plan.userName.trim();

  const p = m.position;
  const otherDebt = p.totalDebt - p.csnDebt;
  const hasNetWorth = p.totalOwned !== p.totalAssets || p.totalDebt > 0;
  const positionRows = [
    { icon: 'account-everyday' as const, accent: 'blue' as const, label: d.position.everyday, value: p.everyday },
    { icon: 'account-savings' as const, accent: 'purple' as const, label: d.position.savings, value: p.cashSavings },
    { icon: 'account-emergency' as const, accent: 'yellow' as const, label: d.position.emergency, value: p.emergency },
    { icon: 'account-investment' as const, accent: 'green' as const, label: d.position.investments, value: p.investments },
    ...(p.home > 0 ? [{ icon: DEBT_ICON.mortgage, accent: 'lavender' as const, label: d.position.home, value: p.home }] : []),
    ...(p.otherProperty > 0 ? [{ icon: DEBT_ICON.car, accent: DEBT_ACCENT.car, label: d.position.otherProperty, value: p.otherProperty }] : []),
    ...(p.csnDebt > 0 ? [{ icon: DEBT_ICON.csn, accent: DEBT_ACCENT.csn, label: d.position.csn, value: -p.csnDebt }] : []),
    ...(otherDebt > 0 ? [{ icon: 'stat-bank' as const, accent: 'red' as const, label: d.position.loans, value: -otherDebt }] : []),
  ];

  return (
    <div>
      <PageHeader
        title={name ? d.greeting.withName(greeting(new Date()), name) : greeting(new Date())}
        subtitle={d.subtitle(formatMonthYear(viewMonth))}
      />

      {isEmpty && (
        <Callout
          tone="tip"
          title={d.empty.title}
          className="mb-5"
          action={
            <LinkButton to="/onboarding/income" size="sm" iconRight={ArrowRight}>
              {d.empty.action}
            </LinkButton>
          }
        >
          {d.empty.body}
        </Callout>
      )}

      {/* Primary overview */}
      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatCard
          icon="stat-safe-to-spend"
          accent="brand"
          label={d.stats.safeToSpend}
          value={money(m.safeToSpend)}
          sub={
            m.actuals.confirmed.length > 0 && m.actuals.variance !== 0
              ? m.actuals.variance > 0
                ? d.stats.billsAbovePlan(money(Math.abs(m.actuals.variance)))
                : d.stats.billsBelowPlan(money(Math.abs(m.actuals.variance)))
              : m.actuals.pending.length > 0 && m.range.safeToSpend.low < m.safeToSpend
                ? d.stats.downTo(money(m.range.safeToSpend.low))
                : m.oneOffsThisMonth > 0
                  ? d.stats.afterOneOffs(money(m.oneOffsThisMonth))
                  : d.stats.availableThisMonth
          }
          className={clsx('col-span-2 xl:col-span-1', m.safeToSpend < 0 && 'border-orange-500/40')}
        />
        <StatCard
          icon="stat-income"
          accent="blue"
          label={d.stats.totalIncome}
          value={money(m.income.total)}
          sub={<DeltaOr before={prev?.income} after={m.income.total} fallback={d.stats.averagePerMonth} />}
        />
        <StatCard
          icon="stat-cost"
          accent="red"
          label={d.stats.normalMonthlyCost}
          value={money(m.lifestyleCost)}
          sub={
            <DeltaOr
              before={prev?.lifestyleCostActual ?? prev?.lifestyleCost}
              after={m.actuals.lifestyleCost}
              invert
              suffix={
                (prev?.billsConfirmed ?? 0) > 0 || m.actuals.confirmed.length > 0
                  ? d.stats.vsLastMonthRealBills
                  : undefined
              }
              fallback={
                m.range.hasRanges
                  ? d.stats.usually(formatMoneyRange(m.range.lifestyleCost.low, m.range.lifestyleCost.high, currency))
                  : d.stats.essential(money(m.essentialCost))
              }
            />
          }
        />
        <StatCard
          icon="stat-saving"
          accent="green"
          label={d.stats.plannedSaving}
          value={money(m.savings.total)}
          sub={<DeltaOr before={prev?.savings} after={m.savings.total} fallback={d.stats.ofIncome(formatPercent(m.savings.rate))} />}
        />
        <StatCard
          icon="stat-bank"
          accent="indigo"
          label={d.stats.bankBalance}
          value={money(m.position.cashInBank)}
          sub={<DeltaOr before={prev?.cashInBank} after={m.position.cashInBank} fallback={d.stats.allCashAccounts} />}
        />
      </div>

      <BillsToConfirm className="mb-5" onEdit={expenses.openEdit} />

      {/* Spending · Position · Goals */}
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        {/* A column, so the donut can take the height the taller cards beside it leave. */}
        <Card className="flex flex-col">
          <CardHeader
            title={d.spending.title}
            subtitle={
              <>
                <span className="tabular font-semibold text-ink">{money(m.lifestyleCost)}</span> {d.spending.perMonth}
              </>
            }
            action={d.spending.viewAll}
            actionTo="/insights"
          />
          {m.hasExpenses || m.hasDebts ? (
            <DonutBreakdown
              slices={slices}
              currency={currency}
              grow
              center={
                <>
                  <span className="tabular text-[16px] font-bold leading-tight text-ink">{formatMoney(m.lifestyleCost, '')}</span>
                  <span className="text-[11px] text-muted">{currency}</span>
                </>
              }
            />
          ) : (
            <p className="text-[13px] text-muted">{d.spending.empty}</p>
          )}
        </Card>

        <Card>
          <CardHeader title={d.position.title} action={d.position.viewAccounts} actionTo="/accounts" />
          <ul className="divide-y divide-line">
            {positionRows.map((r) => (
              <li key={r.label} className={clsx('flex items-center gap-3', positionRows.length > 5 ? 'py-2' : 'py-2.5')}>
                <IconTile icon={r.icon} accent={r.accent} size="sm" />
                <span className="flex-1 text-[13.5px] text-ink-soft">{r.label}</span>
                <span className="tabular text-[13.5px] font-medium text-ink">{money(r.value)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-3">
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-ink">{hasNetWorth ? d.position.netWorth : d.position.totalAssets}</div>
              {m.position.csnDebt > 0 && (
                <div className="text-[11.5px] text-muted">{d.position.excludingCsn(money(m.position.netWorthExcludingCsn))}</div>
              )}
            </div>
            <span className="tabular shrink-0 text-[16px] font-bold text-ink">
              {money(hasNetWorth ? m.position.netWorth : m.position.totalAssets)}
            </span>
          </div>
        </Card>

        <Card>
          <CardHeader icon={<IconTile icon="card-goals" accent="brand" size="sm" />} title={d.goals.title} action={d.goals.viewAll} actionTo="/savings" />
          {goals.length === 0 ? (
            <p className="text-[13px] text-muted">
              {pots.length > 0 ? d.goals.addTarget : d.goals.none}{' '}
              <Link to="/savings" className="font-medium text-brand-700">
                {d.goals.manage}
              </Link>
            </p>
          ) : (
            <ul className="space-y-1">
              {goals.map((g) => {
                const p = goalProgress(g, now, goalReturn(g, returns));
                return (
                  <li key={g.id}>
                    <EditableRow onClick={() => goalSheet.openEdit(g.id)} title={d.goals.edit} className="py-1">
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
            title={d.stability.title}
            action={d.stability.viewDetails}
            actionTo="/income"
          />
          <SplitBar a={m.income.reliable} b={m.income.variable} accentA="brand" accentB="blue" />
          <div className="mt-3 grid grid-cols-2 divide-x divide-line">
            <div>
              <div className="tabular text-[17px] font-semibold text-ink">{money(m.income.reliable)}</div>
              <div className="text-[12px] text-muted">{d.stability.reliable}</div>
            </div>
            <div className="pl-4">
              <div className="tabular text-[17px] font-semibold text-ink">{money(m.income.variable)}</div>
              <div className="text-[12px] text-muted">{d.stability.variable}</div>
            </div>
          </div>
          <div className="mt-4">
            {!m.hasExpenses || !m.hasIncome ? (
              <Callout tone="neutral">{d.stability.empty}</Callout>
            ) : m.resilience.reliableCoversEssentials ? (
              <Callout tone="success">{d.stability.covered}</Callout>
            ) : (
              <Callout tone="warning">{d.stability.notCovered(money(-m.resilience.essentialMargin))}</Callout>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={<IconTile icon="card-upcoming" accent="blue" size="sm" />}
            title={d.upcoming.title}
            action={d.upcoming.viewAll}
            actionTo="/planning#outlook"
          />
          {upcoming.length === 0 ? (
            <p className="text-[13px] text-muted">{d.upcoming.empty}</p>
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.map((u) => {
                const loan = u.source === 'debt' ? shown.debts?.find((d) => d.id === u.expenseId) : undefined;
                return (
                <li key={u.id}>
                  <EditableRow
                    onClick={() =>
                      u.source === 'tax' ? taxSheet.open() : u.source === 'debt' ? loanSheet.openEdit(u.expenseId) : expenses.openEdit(u.expenseId)
                    }
                    title={u.source === 'tax' ? d.upcoming.seeTax : u.source === 'debt' ? d.upcoming.editLoan : d.upcoming.editExpense}
                    className="py-2.5"
                  >
                  <IconTile
                    icon={loan ? DEBT_ICON[loan.kind] : CATEGORY_ICON[u.category]}
                    accent={loan ? DEBT_ACCENT[loan.kind] : CATEGORY_META[u.category].accent}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <EditableTitle className="text-[13.5px] font-medium text-ink">{u.name}</EditableTitle>
                    <div className="text-[12px] text-muted">{formatDate(u.date)}</div>
                  </div>
                  <div className="tabular text-[13.5px] font-semibold text-ink">{money(u.amount)}</div>
                  </EditableRow>
                </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            icon={<IconTile icon="card-income-stopped" accent="purple" size="sm" />}
            title={d.runway.title}
            action={d.runway.viewScenarios}
            actionTo="/planning"
          />
          <div className="grid grid-cols-2 divide-x divide-line">
            <div>
              <div className="tabular text-[22px] font-bold text-ink">{formatMonths(m.resilience.essentialRunwayMonths)}</div>
              <div className="text-[12px] text-muted">{d.runway.essential}</div>
            </div>
            <div className="pl-4">
              <div className="tabular text-[22px] font-bold text-ink">{formatMonths(m.resilience.lifestyleRunwayMonths)}</div>
              <div className="text-[12px] text-muted">{d.runway.lifestyle}</div>
            </div>
          </div>
          <div className="mt-4">
            <Callout tone="info">
              {m.resilience.availableForRunway > 0 && m.essentialCost > 0
                ? d.runway.coverFor(formatMonths(m.resilience.essentialRunwayMonths), money(m.resilience.availableForRunway))
                : d.runway.empty}
              {m.debt.csnMonthly > 0 &&
                m.resilience.availableForRunway > 0 &&
                ` ${d.runway.csn(formatMonths(m.resilience.essentialRunwayCsnReducedMonths))}`}
            </Callout>
          </div>
        </Card>
      </div>

      {/* Resilience strip */}
      <Card className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex items-center gap-3 lg:w-[38%]">
          <IconTile icon="card-resilience" accent="green" />
          <div>
            <div className="text-[13px] font-semibold text-ink">{d.resilience.title}</div>
            <div className="tabular text-[22px] font-bold leading-tight text-ink">
              {m.position.emergency > 0 && m.essentialCost > 0 ? formatMonths(m.resilience.emergencyMonths) : '–'}
            </div>
            <div className="text-[12px] text-muted">{d.resilience.caption}</div>
          </div>
        </div>
        <div className="flex-1 lg:border-l lg:border-line lg:pl-5">
          <ResilienceMessage />
        </div>
        <LinkButton to="/insights" variant="secondary" iconRight={ArrowRight} className="self-start lg:self-center">
          {d.resilience.viewInsights}
        </LinkButton>
      </Card>

      {expenses.sheet}
      {goalSheet.sheet}
      {loanSheet.sheet}
      {taxSheet.sheet}

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
  const r = useT().dashboard.resilience;
  const m = useMetrics();
  const currency = useCurrency();
  const months = m.resilience.emergencyMonths;
  if (!m.hasExpenses) {
    return <Callout tone="neutral">{r.empty}</Callout>;
  }
  if (m.position.emergency === 0) {
    return (
      <Callout tone="tip" title={r.noFundTitle}>
        {r.noFundBody(formatMonths(m.resilience.essentialRunwayMonths))}
      </Callout>
    );
  }
  if (months >= 3) {
    return (
      <Callout tone="success" title={r.goodTitle}>
        {r.goodBody(formatMoney(m.breathingRoom, currency))}
      </Callout>
    );
  }
  return (
    <Callout tone="warning" title={r.lowTitle(formatMonths(months))}>
      {r.lowBody(formatMoney(m.breathingRoom, currency))}
    </Callout>
  );
}
