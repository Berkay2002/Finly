import { IconTile } from '@/components/ui/IconTile';
import { formatMoney, formatPercent } from '@/engine/format';
import { useT } from '@/i18n';
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
  const t = useT().income.page;
  const money = (n: number) => formatMoney(n, currency);
  const reliableShare = m.income.total > 0 ? m.income.reliable / m.income.total : 0;

  return (
    <div>
      <PageHeader title={t.title} subtitle={t.subtitle} />

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon="stat-income" accent="brand" label={t.averageMonthly} value={money(m.income.total)} sub={t.perYear(money(m.income.total * 12))} />
        <StatCard icon="account-salary" accent="blue" label={t.reliableIncome} value={money(m.income.reliable)} sub={t.ofTotal(formatPercent(reliableShare))} />
        <StatCard icon="card-income-change" accent="purple" label={t.variableIncome} value={money(m.income.variable)} sub={t.estimatedAverage} />
        <StatCard
          icon="card-resilience"
          accent={m.resilience.reliableCoversEssentials ? 'green' : 'orange'}
          label={t.essentialsCovered}
          value={m.essentialCost > 0 ? formatPercent(Math.min(1, m.income.reliable / m.essentialCost)) : '–'}
          sub={m.essentialCost > 0 ? t.essentialPerMonth(money(m.essentialCost)) : t.addExpensesToSee}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader title={t.sources} subtitle={t.sourcesSubtitle} />
          <IncomeEditor autoOpenAdd={autoAdd} />
        </Card>

        <div className="space-y-4 self-start">
          <Card>
            <CardHeader icon={<IconTile icon="card-income-stability" accent="green" size="sm" />} title={t.stability} />
            <SplitBar a={m.income.reliable} b={m.income.variable} accentA="brand" accentB="purple" />
            <div className="mt-3 grid grid-cols-2 divide-x divide-line">
              <div>
                <div className="tabular text-[17px] font-semibold text-ink">{money(m.income.reliable)}</div>
                <div className="text-[12px] text-muted">{t.reliableIncome}</div>
              </div>
              <div className="pl-4">
                <div className="tabular text-[17px] font-semibold text-ink">{money(m.income.variable)}</div>
                <div className="text-[12px] text-muted">{t.variableIncome}</div>
              </div>
            </div>
            <div className="mt-4">
              {!m.hasExpenses ? (
                <Callout tone="neutral">{t.addExpensesCallout}</Callout>
              ) : m.resilience.reliableCoversEssentials ? (
                <Callout tone="success">
                  {t.covered(money(m.resilience.essentialMargin))}
                </Callout>
              ) : (
                <Callout tone="warning" title={t.dependsTitle}>
                  {t.depends(money(-m.resilience.essentialMargin))}
                </Callout>
              )}
            </div>
          </Card>
          {m.income.excluded > 0 && (
            <Callout tone="neutral">
              {t.excluded(money(m.income.excluded))}
            </Callout>
          )}
        </div>
      </div>
    </div>
  );
}
