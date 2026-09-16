import { IconTile } from '@/components/ui/IconTile';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCompact, formatMoney, formatPercent, formatShortMonth, formatShortMonthYear } from '@/engine/format';
import { useAutoAdd } from '@/lib/useAutoAdd';
import { useCurrency, useMetrics, usePreviousSnapshot, useSavingsProjection } from '@/store/selectors';
import { GoalEditor } from '@/components/forms/GoalEditor';
import { PageHeader } from '@/components/layout/PageHeader';
import { Callout } from '@/components/ui/Callout';
import { Card, CardHeader } from '@/components/ui/Card';
import { DeltaOr } from '@/components/ui/Delta';
import { DonutBreakdown, type DonutSlice } from '@/components/ui/Donut';
import { Switch } from '@/components/ui/fields';
import { StatCard } from '@/components/ui/StatCard';

export function SavingsPage() {
  const m = useMetrics();
  const currency = useCurrency();
  const prev = usePreviousSnapshot();
  const autoAdd = useAutoAdd();
  const [includeUnallocated, setIncludeUnallocated] = useState(false);
  const projection = useSavingsProjection(includeUnallocated);
  const money = (n: number) => formatMoney(n, currency);

  const futureShare = m.savings.total > 0 ? m.savings.futureSpending / m.savings.total : 0;
  const longShare = m.savings.total > 0 ? m.savings.longTerm / m.savings.total : 0;
  const slices: DonutSlice[] = [
    { key: 'future', label: 'Planned future spending', value: m.savings.futureSpending, accent: 'green' },
    { key: 'long', label: 'Long-term wealth', value: m.savings.longTerm, accent: 'blue' },
  ];
  const last = projection[projection.length - 1];
  const chartData = projection.map((p) => ({
    name: formatShortMonth(p.month),
    full: formatShortMonthYear(p.month),
    balance: Math.round(p.balance),
    added: Math.round(p.added),
  }));

  return (
    <div>
      <PageHeader title="Savings & Goals" subtitle="Turn your goals into reality, one step at a time." />

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          icon="nav-savings"
          accent="blue"
          label="Monthly savings"
          value={money(m.savings.total)}
          sub={<DeltaOr before={prev?.savings} after={m.savings.total} fallback={`${money(m.savings.total * 12)} per year`} />}
        />
        <StatCard
          icon="card-savings-projection"
          accent="brand"
          label="Savings rate"
          value={formatPercent(m.savings.rate)}
          sub={<DeltaOr before={prev?.savingsRate} after={m.savings.rate} fallback={`${formatPercent(m.savings.rateOfReliable)} of reliable income`} />}
        />
        <StatCard icon="card-per-day" accent="green" label="Planned future spending" value={formatPercent(futureShare)} sub={`${money(m.savings.futureSpending)} / month`} />
        <StatCard icon="account-investment" accent="purple" label="Long-term wealth" value={formatPercent(longShare)} sub={`${money(m.savings.longTerm)} / month`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card>
          <CardHeader icon={<IconTile icon="card-goals" accent="brand" size="sm" />} title="Your savings goals" subtitle="Track your progress and stay motivated." />
          <GoalEditor autoOpenAdd={autoAdd} />
        </Card>

        <div className="space-y-4 self-start">
          <Card>
            <CardHeader icon={<IconTile icon="card-allocation" accent="purple" size="sm" />} title="Where your savings go" subtitle="This month's savings split." />
            {m.savings.total === 0 ? (
              <p className="text-[13px] text-muted">Add a monthly contribution to a goal to see the split.</p>
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
                      ? "More than half of your saving builds long-term security. You're on track to create a more secure future."
                      : 'Most of your saving is for things you plan to spend on. That is a valid choice; long-term goals build resilience.'}
                  </Callout>
                </div>
              </>
            )}
          </Card>

          <Card>
            <CardHeader icon={<IconTile icon="card-savings-projection" accent="green" size="sm" />} title="12-month savings projection" subtitle={`Based on your current monthly savings of ${money(m.savings.total)}.`} />
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#e6eaf0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7a90' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7a90' }} axisLine={false} tickLine={false} tickFormatter={formatCompact} width={52} />
                  <Tooltip
                    cursor={{ fill: '#f5f7fa' }}
                    content={({ active, payload }) =>
                      active && payload?.[0] ? (
                        <div className="rounded-lg border border-line bg-card px-3 py-2 text-[12px] shadow">
                          <div className="text-muted">{(payload[0].payload as { full: string }).full}</div>
                          <div className="tabular font-semibold text-ink">{money(payload[0].value as number)}</div>
                        </div>
                      ) : null
                    }
                  />
                  <Bar dataKey="balance" fill="#34b27b" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Switch
              className="mt-3"
              checked={includeUnallocated}
              onChange={setIncludeUnallocated}
              label="Assume unallocated money is saved too"
              description={`Adds ${money(Math.max(0, m.breathingRoom))} per month`}
            />
            <div className="mt-3">
              <Callout tone="success">
                {last
                  ? `Keep going! You could add around ${money(last.added)} in 12 months at your current rate, reaching ${money(last.balance)}.`
                  : 'Add goals to see a projection.'}
              </Callout>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
