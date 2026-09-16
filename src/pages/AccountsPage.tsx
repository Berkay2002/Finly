import { IconTile } from '@/components/ui/IconTile';
import { formatMoney, formatPercent } from '@/engine/format';
import { useAutoAdd } from '@/lib/useAutoAdd';
import { useCurrency, useMetrics, usePlan, usePreviousSnapshot } from '@/store/selectors';
import { AccountEditor } from '@/components/forms/AccountEditor';
import { PageHeader } from '@/components/layout/PageHeader';
import { Callout } from '@/components/ui/Callout';
import { Card, CardHeader } from '@/components/ui/Card';
import { DeltaOr } from '@/components/ui/Delta';
import { DonutBreakdown, type DonutSlice } from '@/components/ui/Donut';
import { ACCOUNT_ACCENT } from '@/components/ui/icons';
import { StatCard } from '@/components/ui/StatCard';

export function AccountsPage() {
  const plan = usePlan();
  const m = useMetrics();
  const currency = useCurrency();
  const prev = usePreviousSnapshot();
  const autoAdd = useAutoAdd();
  const money = (n: number) => formatMoney(n, currency);

  const slices: DonutSlice[] = [...plan.accounts]
    .sort((a, b) => b.balance - a.balance)
    .map((a) => ({ key: a.id, label: a.name, value: a.balance, accent: ACCOUNT_ACCENT[a.kind] }));

  const investShare = m.position.totalAssets > 0 ? m.position.investments / m.position.totalAssets : 0;
  const emergencyMonths = m.resilience.emergencyMonths;

  return (
    <div>
      <PageHeader title="Accounts & Financial Position" subtitle="All your accounts. One clear overview." />

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          icon="stat-bank"
          accent="blue"
          label="Total tracked assets"
          value={money(m.position.totalAssets)}
          sub={<DeltaOr before={prev?.totalAssets} after={m.position.totalAssets} fallback="All accounts combined" />}
        />
        <StatCard
          icon="account-cash"
          accent="green"
          label="Cash in bank"
          value={money(m.position.cashInBank)}
          sub={<DeltaOr before={prev?.cashInBank} after={m.position.cashInBank} fallback="Everyday + savings accounts" />}
        />
        <StatCard
          icon="account-emergency"
          accent="yellow"
          label="Emergency savings"
          value={money(m.position.emergency)}
          sub={
            m.essentialCost > 0 && m.position.emergency > 0
              ? `${emergencyMonths.toFixed(1)} months of essentials`
              : 'Reserved for the unexpected'
          }
        />
        <StatCard
          icon="account-investment"
          accent="purple"
          label="Investments"
          value={money(m.position.investments)}
          sub={<DeltaOr before={prev?.investments} after={m.position.investments} fallback={`${formatPercent(investShare)} of assets`} />}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Your accounts" subtitle="Balances are what you tell us. Update them whenever you like." />
            <AccountEditor autoOpenAdd={autoAdd} />
          </Card>

          <Card>
            <CardHeader icon={<IconTile icon="card-position" accent="blue" size="sm" />} title="Your financial position" subtitle="Money you can spend now, kept apart from money you own but do not intend to spend." />
            <dl className="divide-y divide-line">
              {[
                ['Everyday money', m.position.everyday, 'Spending, salary and joint accounts'],
                ['Cash savings', m.position.cashSavings, 'Savings accounts and cash'],
                ['Dedicated emergency savings', m.position.emergency, 'Not for everyday spending'],
                ['Investment value', m.position.investments, 'Tracked, not spendable'],
                ...(m.position.other > 0 ? [['Other tracked balances', m.position.other, '']] : []),
                ['Total tracked assets', m.position.totalAssets, ''],
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
            <CardHeader icon={<IconTile icon="card-allocation" accent="purple" size="sm" />} title="Account allocation" />
            {plan.accounts.length === 0 ? (
              <p className="text-[13px] text-muted">Add accounts to see how your money is spread.</p>
            ) : (
              <>
                <DonutBreakdown
                  slices={slices}
                  currency={currency}
                  center={
                    <>
                      <span className="tabular text-[17px] font-bold text-ink">{formatMoney(m.position.totalAssets, '')}</span>
                      <span className="text-[11px] text-muted">{currency} total</span>
                    </>
                  }
                />
                <div className="mt-4">
                  {investShare >= 0.5 ? (
                    <Callout tone="success" title={`Investments make up ${formatPercent(investShare)} of your total assets.`}>
                      Remember they can move in value, so they are kept separate from your runway.
                    </Callout>
                  ) : m.position.emergency === 0 && m.position.totalAssets > 0 ? (
                    <Callout tone="tip" title="No dedicated emergency savings yet">
                      Marking an account as an emergency fund lets Finly show how many months of essentials it covers.
                    </Callout>
                  ) : (
                    <Callout tone="success" title="Your accounts are in good shape.">
                      {formatPercent(m.position.cashInBank / Math.max(1, m.position.totalAssets))} of your assets are cash you can reach quickly.
                    </Callout>
                  )}
                </div>
              </>
            )}
          </Card>
          <Callout tone="neutral" icon="goal-piggy">
            Goal balances on the Savings page are tracked separately from account balances, so a goal can span several accounts.
          </Callout>
        </div>
      </div>
    </div>
  );
}
