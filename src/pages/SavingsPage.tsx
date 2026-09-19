import { IconTile } from '@/components/ui/IconTile';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCompact, formatMoney, formatPercent, formatShortMonth, formatShortMonthYear } from '@/engine/format';
import { useT } from '@/i18n';
import { useAutoAdd } from '@/lib/useAutoAdd';
import { useCurrency, useMetrics, usePreviousMonth, usePreviousSnapshot, useSavingsProjection } from '@/store/selectors';
import { GoalEditor } from '@/components/forms/GoalEditor';
import { PageHeader } from '@/components/layout/PageHeader';
import { Callout } from '@/components/ui/Callout';
import { Card, CardHeader } from '@/components/ui/Card';
import { DonutBreakdown, type DonutSlice } from '@/components/ui/Donut';
import { Switch } from '@/components/ui/fields';
import { StatCard } from '@/components/ui/StatCard';
import { StatGrid } from '@/components/ui/StatGrid';

export function SavingsPage() {
  const m = useMetrics();
  const currency = useCurrency();
  const prev = usePreviousMonth();
  const closed = usePreviousSnapshot();
  const autoAdd = useAutoAdd();
  const t = useT().goals.page;
  const [includeUnallocated, setIncludeUnallocated] = useState(false);
  const projection = useSavingsProjection(includeUnallocated);
  const money = (n: number) => formatMoney(n, currency);

  const futureShare = m.savings.total > 0 ? m.savings.futureSpending / m.savings.total : 0;
  const longShare = m.savings.total > 0 ? m.savings.longTerm / m.savings.total : 0;
  const slices: DonutSlice[] = [
    { key: 'future', label: t.plannedFutureSpending, value: m.savings.futureSpending, accent: 'green' },
    { key: 'long', label: t.longTermWealth, value: m.savings.longTerm, accent: 'blue' },
  ];
  const last = projection[projection.length - 1];
  const earns = last ? last.withReturns - last.balance >= 1 : false;
  const chartData = projection.map((p) => ({
    name: formatShortMonth(p.month),
    full: formatShortMonthYear(p.month),
    balance: Math.round(p.balance),
    returns: Math.max(0, Math.round(p.withReturns - p.balance)),
    added: Math.round(p.added),
  }));

  return (
    <div>
      <PageHeader title={t.title} subtitle={t.subtitle} />

      <StatGrid>
        <StatCard
          icon="nav-savings"
          accent="blue"
          label={t.monthlySavings}
          value={money(m.savings.total)}
          trend={{ before: prev?.savings, after: m.savings.total }}
          sub={t.perYear(money(m.savings.total * 12))}
        />
        <StatCard
          icon="card-savings-projection"
          accent="brand"
          label={t.savingsRate}
          value={formatPercent(m.savings.rate)}
          trend={{ before: prev?.savingsRate, after: m.savings.rate }}
          sub={t.ofReliableIncome(formatPercent(m.savings.rateOfReliable))}
        />
        <StatCard icon="card-per-day" accent="green" label={t.plannedFutureSpending} value={formatPercent(futureShare)} sub={t.perMonth(money(m.savings.futureSpending))} />
        <StatCard icon="account-investment" accent="purple" label={t.longTermWealth} value={formatPercent(longShare)} sub={t.perMonth(money(m.savings.longTerm))} />
      </StatGrid>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card>
          <CardHeader icon={<IconTile icon="card-goals" accent="brand" size="sm" />} title={t.yourGoals} subtitle={t.yourGoalsSubtitle} />
          <GoalEditor autoOpenAdd={autoAdd} previous={closed && { ...closed.byAccount, ...closed.byGoal }} />
        </Card>

        <div className="space-y-4 self-start">
          <Card>
            <CardHeader icon={<IconTile icon="card-allocation" accent="purple" size="sm" />} title={t.whereSavingsGo} subtitle={t.whereSavingsGoSubtitle} />
            {m.savings.total === 0 ? (
              <p className="text-[13px] text-muted">{t.addContributionToSeeSplit}</p>
            ) : (
              <>
                <DonutBreakdown
                  slices={slices}
                  currency={currency}
                  center={
                    <>
                      <span className="tabular text-[16px] font-bold text-ink">{formatMoney(m.savings.total, '')}</span>
                      <span className="text-[11px] text-muted">{currency}</span>
                    </>
                  }
                />
                <div className="mt-4">
                  <Callout tone="success" icon="account-investment">
                    {longShare >= 0.5
                      ? t.mostlyLongTerm
                      : t.mostlyPlanned}
                  </Callout>
                </div>
              </>
            )}
          </Card>

          <Card>
            <CardHeader
              icon={<IconTile icon="card-savings-projection" accent="green" size="sm" />}
              title={t.projectionTitle}
              subtitle={
                earns
                  ? t.projectionWithReturns(money(m.savings.total))
                  : t.projectionPlain(money(m.savings.total))
              }
            />
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--color-line)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} tickFormatter={formatCompact} width={52} />
                  <Tooltip
                    cursor={{ fill: 'var(--color-page)' }}
                    content={({ active, payload }) => {
                      const row = payload?.[0]?.payload as (typeof chartData)[number] | undefined;
                      return active && row ? (
                        <div className="rounded-lg border border-line bg-card px-3 py-2 text-[12px] shadow">
                          <div className="text-muted">{row.full}</div>
                          <div className="tabular font-semibold text-ink">{money(row.balance + row.returns)}</div>
                          {row.returns > 0 && <div className="tabular text-muted">{t.inclReturns(money(row.returns))}</div>}
                        </div>
                      ) : null;
                    }}
                  />
                  <Bar dataKey="balance" stackId="s" fill="var(--color-green-500)" radius={earns ? [0, 0, 0, 0] : [6, 6, 0, 0]} isAnimationActive={false} />
                  {earns && <Bar dataKey="returns" stackId="s" fill="var(--color-brand-200)" radius={[6, 6, 0, 0]} isAnimationActive={false} />}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Switch
              className="mt-3"
              checked={includeUnallocated}
              onChange={setIncludeUnallocated}
              label={t.assumeUnallocated}
              description={t.addsPerMonth(money(Math.max(0, m.breathingRoom)))}
            />
            <div className="mt-3">
              <Callout tone="success">
                {last
                  ? earns
                    ? t.keepGoingWithReturns(money(last.added), money(last.withReturns - last.balance), money(last.withReturns))
                    : t.keepGoing(money(last.added), money(last.balance))
                  : t.addGoalsForProjection}
              </Callout>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
