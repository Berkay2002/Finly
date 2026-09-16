import { IconTile } from '@/components/ui/IconTile';
import { formatMoney, formatPercent } from '@/engine/format';
import { useAutoAdd } from '@/lib/useAutoAdd';
import { useCurrency, useMetrics } from '@/store/selectors';
import { IncomeEditor } from '@/components/forms/IncomeEditor';
import { PageHeader } from '@/components/layout/PageHeader';
import { Callout } from '@/components/ui/Callout';
import { Card, CardHeader } from '@/components/ui/Card';
import { SplitBar } from '@/components/ui/ProgressBar';
import { StatCard } from '@/components/ui/StatCard';

export function IncomePage() {
  const m = useMetrics();
  const currency = useCurrency();
  const autoAdd = useAutoAdd();
  const money = (n: number) => formatMoney(n, currency);
  const reliableShare = m.income.total > 0 ? m.income.reliable / m.income.total : 0;

  return (
    <div>
      <PageHeader title="Income" subtitle="Everything that comes in, and how much of it you can count on." />

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon="stat-income" accent="brand" label="Average monthly income" value={money(m.income.total)} sub={`${money(m.income.total * 12)} per year`} />
        <StatCard icon="account-salary" accent="blue" label="Reliable income" value={money(m.income.reliable)} sub={`${formatPercent(reliableShare)} of total`} />
        <StatCard icon="card-income-change" accent="purple" label="Variable income" value={money(m.income.variable)} sub="Estimated average" />
        <StatCard
          icon="card-resilience"
          accent={m.resilience.reliableCoversEssentials ? 'green' : 'orange'}
          label="Essentials covered by reliable income"
          value={m.essentialCost > 0 ? formatPercent(Math.min(1, m.income.reliable / m.essentialCost)) : '–'}
          sub={m.essentialCost > 0 ? `${money(m.essentialCost)} essential per month` : 'Add expenses to see this'}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader title="Income sources" subtitle="Tap a row to edit its details." />
          <IncomeEditor autoOpenAdd={autoAdd} />
        </Card>

        <div className="space-y-4 self-start">
          <Card>
            <CardHeader icon={<IconTile icon="card-income-stability" accent="green" size="sm" />} title="Income stability" />
            <SplitBar a={m.income.reliable} b={m.income.variable} accentA="brand" accentB="purple" />
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
              {!m.hasExpenses ? (
                <Callout tone="neutral">Add your expenses to see whether reliable income covers your essentials.</Callout>
              ) : m.resilience.reliableCoversEssentials ? (
                <Callout tone="success">
                  Your essential costs are covered by your reliable income, with {money(m.resilience.essentialMargin)} to spare.
                </Callout>
              ) : (
                <Callout tone="warning" title="Essentials depend on variable income">
                  {money(-m.resilience.essentialMargin)} of your essential costs each month relies on income that can vary.
                </Callout>
              )}
            </div>
          </Card>
          {m.income.excluded > 0 && (
            <Callout tone="neutral">
              {money(m.income.excluded)} per month is tracked but excluded from your baseline budget.
            </Callout>
          )}
        </div>
      </div>
    </div>
  );
}
