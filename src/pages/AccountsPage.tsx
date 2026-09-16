import { IconTile } from '@/components/ui/IconTile';
import { formatMoney, formatMonths, formatPercent } from '@/engine/format';
import { useT } from '@/i18n';
import { useAutoAdd } from '@/lib/useAutoAdd';
import { useCurrency, useEffectivePlan, useMetrics, usePreviousSnapshot } from '@/store/selectors';
import { AccountEditor } from '@/components/forms/AccountEditor';
import { SavingsTaxStrip } from '@/components/forms/SavingsTax';
import { PageHeader } from '@/components/layout/PageHeader';
import { Callout } from '@/components/ui/Callout';
import { Card, CardHeader } from '@/components/ui/Card';
import { DeltaOr } from '@/components/ui/Delta';
import { DonutBreakdown, type DonutSlice } from '@/components/ui/Donut';
import { ACCOUNT_ACCENT } from '@/components/ui/icons';
import { StatCard } from '@/components/ui/StatCard';

export function AccountsPage() {
  const plan = useEffectivePlan();
  const m = useMetrics();
  const currency = useCurrency();
  const prev = usePreviousSnapshot();
  const autoAdd = useAutoAdd();
  const t = useT().accounts.page;
  const money = (n: number) => formatMoney(n, currency);

  const slices: DonutSlice[] = [...plan.accounts]
    .sort((a, b) => b.balance - a.balance)
    .map((a) => ({ key: a.id, label: a.name, value: a.balance, accent: ACCOUNT_ACCENT[a.kind] }));

  const investShare = m.position.totalAssets > 0 ? m.position.investments / m.position.totalAssets : 0;
  const emergencyMonths = m.resilience.emergencyMonths;

  return (
    <div>
      <PageHeader title={t.title} subtitle={t.subtitle} />

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          icon="stat-bank"
          accent="blue"
          label={t.totalAssets}
          value={money(m.position.totalAssets)}
          sub={<DeltaOr before={prev?.totalAssets} after={m.position.totalAssets} fallback={t.allAccountsCombined} />}
        />
        <StatCard
          icon="account-cash"
          accent="green"
          label={t.cashInBank}
          value={money(m.position.cashInBank)}
          sub={<DeltaOr before={prev?.cashInBank} after={m.position.cashInBank} fallback={t.everydayPlusSavings} />}
        />
        <StatCard
          icon="account-emergency"
          accent="yellow"
          label={t.emergencySavings}
          value={money(m.position.emergency)}
          sub={
            <DeltaOr
              before={prev?.emergency}
              after={m.position.emergency}
              fallback={
                m.essentialCost > 0 && m.position.emergency > 0
                  ? t.monthsOfEssentials(formatMonths(emergencyMonths))
                  : t.reservedForUnexpected
              }
            />
          }
        />
        <StatCard
          icon="account-investment"
          accent="purple"
          label={t.investments}
          value={money(m.position.investments)}
          sub={<DeltaOr before={prev?.investments} after={m.position.investments} fallback={t.ofAssets(formatPercent(investShare))} />}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title={t.yourAccounts} subtitle={t.yourAccountsSubtitle} />
            <AccountEditor autoOpenAdd={autoAdd} previous={prev?.byAccount} />
          </Card>

          <SavingsTaxStrip />

          <Card>
            <CardHeader icon={<IconTile icon="card-position" accent="blue" size="sm" />} title={t.position} subtitle={t.positionSubtitle} />
            <dl className="divide-y divide-line">
              {[
                [t.everydayMoney, m.position.everyday, t.everydayMoneyHint],
                [t.cashSavings, m.position.cashSavings, t.cashSavingsHint],
                [t.dedicatedEmergency, m.position.emergency, t.dedicatedEmergencyHint],
                [t.investmentValue, m.position.investments, t.investmentValueHint],
                ...(m.position.other > 0 ? [[t.otherBalances, m.position.other, '']] : []),
                [t.totalAssets, m.position.totalAssets, ''],
                ...(m.position.totalDebt > 0
                  ? [
                      [t.loans, -m.position.totalDebt, t.loansHint],
                      [t.netWorth, m.position.netWorth, t.netWorthHint],
                    ]
                  : []),
                ...(m.position.netWorth - m.position.netWorthAfterTax >= 1
                  ? [[t.ifSoldAfterTax, m.position.netWorthAfterTax, t.ifSoldAfterTaxHint]]
                  : []),
              ].map(([label, value, sub], i, arr) => (
                <div key={String(label)} className="flex items-center justify-between gap-3 py-2.5">
                  <dt className={i === arr.length - 1 ? 'text-[13.5px] font-semibold text-ink' : 'text-[13.5px] text-ink-soft'}>
                    {label}
                    {sub ? <span className="block text-[11.5px] text-faint sm:ml-2 sm:inline">{sub}</span> : null}
                  </dt>
                  <dd className={`tabular shrink-0 whitespace-nowrap text-[13.5px] ${i === arr.length - 1 ? 'font-semibold text-ink' : 'font-medium text-ink'}`}>
                    {money(Number(value))}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>

        <div className="space-y-4 self-start">
          <Card>
            <CardHeader icon={<IconTile icon="card-allocation" accent="purple" size="sm" />} title={t.allocation} />
            {plan.accounts.length === 0 ? (
              <p className="text-[13px] text-muted">{t.addAccountsToSee}</p>
            ) : (
              <>
                <DonutBreakdown
                  slices={slices}
                  currency={currency}
                  center={
                    <>
                      <span className="tabular text-[17px] font-bold text-ink">{formatMoney(m.position.totalAssets, '')}</span>
                      <span className="text-[11px] text-muted">{t.currencyTotal(currency)}</span>
                    </>
                  }
                />
                <div className="mt-4">
                  {investShare >= 0.5 ? (
                    <Callout tone="success" title={t.investmentsShare(formatPercent(investShare))}>
                      {t.investmentsShareBody}
                    </Callout>
                  ) : m.position.emergency === 0 && m.position.totalAssets > 0 ? (
                    <Callout tone="tip" title={t.noEmergencyTitle}>
                      {t.noEmergencyBody}
                    </Callout>
                  ) : (
                    <Callout tone="success" title={t.goodShapeTitle}>
                      {t.goodShapeBody(formatPercent(m.position.cashInBank / Math.max(1, m.position.totalAssets)))}
                    </Callout>
                  )}
                </div>
              </>
            )}
          </Card>
          <Callout tone="neutral" icon="goal-piggy">
            {t.goalsSeparate}
          </Callout>
        </div>
      </div>
    </div>
  );
}
