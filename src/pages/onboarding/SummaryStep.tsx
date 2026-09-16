import { Pencil } from 'lucide-react';
import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { formatMoney, formatMoneyRange, formatPercent } from '@/engine/format';
import { CATEGORY_META } from '@/engine/taxonomy';
import { EXPENSE_CATEGORIES } from '@/engine/types';
import { useCurrency, useMetrics } from '@/store/selectors';
import { Callout } from '@/components/ui/Callout';
import { CATEGORY_ICON } from '@/components/ui/icons';
import { Icon, type IconSource } from '@/components/ui/Icon';

function Section({
  icon,
  title,
  editTo,
  children,
}: {
  icon: IconSource;
  title: string;
  editTo: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-card">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          <Icon icon={icon} size={16} pictureScale={1.6} className="text-brand-600" />
          {title}
        </div>
        <Link to={editTo} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-700 hover:underline">
          <Pencil size={12} /> Edit
        </Link>
      </div>
      <dl className="divide-y divide-line px-4">{children}</dl>
    </div>
  );
}

function Line({
  label,
  value,
  sub,
  strong,
  negative,
}: {
  label: ReactNode;
  value: string;
  sub?: string;
  strong?: boolean;
  negative?: boolean;
}) {
  return (
    <div className={clsx('flex items-center justify-between gap-3 py-2.5', strong && 'font-semibold')}>
      <dt className={clsx('flex items-center gap-2 text-[13.5px]', strong ? 'text-ink' : 'text-ink-soft')}>{label}</dt>
      <dd className="shrink-0 text-right">
        <div className={clsx('tabular whitespace-nowrap text-[13.5px]', negative ? 'text-negative' : 'text-ink')}>{value}</div>
        {sub && <div className="text-[11.5px] font-normal text-muted">{sub}</div>}
      </dd>
    </div>
  );
}

export function SummaryStep() {
  const m = useMetrics();
  const currency = useCurrency();
  const money = (n: number) => formatMoney(n, currency);

  return (
    <div className="space-y-4">
      {m.breathingRoom < 0 ? (
        <Callout tone="warning" title={`Your plan is ${money(-m.breathingRoom)} per month over your income`}>
          Nothing is wrong with your numbers. The dashboard will show what is flexible and what you could change.
        </Callout>
      ) : m.hasIncome && m.hasExpenses ? (
        <Callout tone="success" title={`${money(m.breathingRoom)} per month is unallocated`}>
          After your normal lifestyle and planned saving, this is your breathing room.
        </Callout>
      ) : (
        <Callout tone="tip" title="Some sections are still empty">
          You can confirm now and fill them in later from the dashboard.
        </Callout>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Section icon="stat-income" title="Income" editTo="/onboarding/income">
          <Line label="Reliable income" value={money(m.income.reliable)} />
          <Line label="Average variable income" value={money(m.income.variable)} />
          <Line label="Average monthly income" value={money(m.income.total)} strong />
        </Section>

        <Section icon="stat-cost" title="Expenses" editTo="/onboarding/home">
          {EXPENSE_CATEGORIES.map((c) => {
            return (
              <Line
                key={c}
                label={
                  <>
                    <Icon icon={CATEGORY_ICON[c]} size={14} pictureScale={1.5} className="text-muted" />
                    {c === 'planned' ? 'Irregular costs (monthly equivalent)' : CATEGORY_META[c].label}
                  </>
                }
                value={money(m.expenses.byCategory[c])}
              />
            );
          })}
          {m.debt.monthly > 0 && (
            <Line
              label={
                <>
                  <Icon icon="stat-bank" size={14} pictureScale={1.5} className="text-muted" />
                  Loan payments
                </>
              }
              value={money(m.debt.monthly)}
              sub={m.debt.interest > 0 ? `${money(m.debt.interest)} of it interest` : undefined}
            />
          )}
          <Line
            label="Normal lifestyle cost"
            value={money(m.lifestyleCost)}
            strong
            sub={
              m.range.hasRanges
                ? `usually ${formatMoneyRange(m.range.lifestyleCost.low, m.range.lifestyleCost.high, currency)}`
                : undefined
            }
          />
        </Section>

        <Section icon="nav-savings" title="Financial plan" editTo="/onboarding/savings">
          <Line label="Total expected monthly spending" value={money(m.lifestyleCost)} />
          <Line
            label="Planned saving"
            value={money(m.savings.futureSpending)}
            sub="for planned future spending"
          />
          <Line label="Planned investing & long-term" value={money(m.savings.longTerm)} />
          <Line
            label="Unallocated money"
            value={money(m.breathingRoom)}
            strong
            negative={m.breathingRoom < 0}
            sub={
              m.range.hasRanges && m.income.total > 0
                ? `${money(m.range.breathingRoom.low)} in an expensive month`
                : m.income.total > 0
                  ? `${formatPercent(m.breathingRoom / m.income.total)} of income`
                  : undefined
            }
          />
        </Section>

        <Section icon="stat-bank" title="Current position" editTo="/onboarding/accounts">
          <Line label="Everyday money" value={money(m.position.everyday)} />
          <Line label="Cash savings" value={money(m.position.cashSavings)} />
          <Line label="Emergency savings" value={money(m.position.emergency)} />
          <Line label="Investments" value={money(m.position.investments)} />
          {m.position.other > 0 && <Line label="Other tracked balances" value={money(m.position.other)} />}
          <Line label="Total tracked assets" value={money(m.position.totalAssets)} strong={m.position.totalDebt === 0} />
          {m.position.totalDebt > 0 && (
            <>
              <Line label="Loans" value={money(-m.position.totalDebt)} />
              <Line label="Net worth" value={money(m.position.netWorth)} strong negative={m.position.netWorth < 0} />
            </>
          )}
        </Section>
      </div>
    </div>
  );
}
