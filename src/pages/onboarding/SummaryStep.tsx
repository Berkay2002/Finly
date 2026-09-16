import { Pencil } from 'lucide-react';
import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { formatMoney, formatMoneyRange, formatPercent } from '@/engine/format';
import { CATEGORY_META } from '@/engine/taxonomy';
import { EXPENSE_CATEGORIES } from '@/engine/types';
import { useT } from '@/i18n';
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
  const t = useT().summary.step;
  return (
    <div className="rounded-2xl border border-line bg-card">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          <Icon icon={icon} size={16} pictureScale={1.6} className="text-brand-600" />
          {title}
        </div>
        <Link to={editTo} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-700 hover:underline">
          <Pencil size={12} /> {t.edit}
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
  const t = useT().summary.step;

  return (
    <div className="space-y-4">
      {m.breathingRoom < 0 ? (
        <Callout tone="warning" title={t.overTitle(money(-m.breathingRoom))}>
          {t.overBody}
        </Callout>
      ) : m.hasIncome && m.hasExpenses ? (
        <Callout tone="success" title={t.unallocatedTitle(money(m.breathingRoom))}>
          {t.unallocatedBody}
        </Callout>
      ) : (
        <Callout tone="tip" title={t.emptyTitle}>
          {t.emptyBody}
        </Callout>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Section icon="stat-income" title={t.income.title} editTo="/onboarding/income">
          <Line label={t.income.reliable} value={money(m.income.reliable)} />
          <Line label={t.income.variable} value={money(m.income.variable)} />
          <Line label={t.income.total} value={money(m.income.total)} strong />
        </Section>

        <Section icon="stat-cost" title={t.expenses.title} editTo="/onboarding/home">
          {EXPENSE_CATEGORIES.map((c) => {
            return (
              <Line
                key={c}
                label={
                  <>
                    <Icon icon={CATEGORY_ICON[c]} size={14} pictureScale={1.5} className="text-muted" />
                    {c === 'planned' ? t.expenses.irregular : CATEGORY_META[c].label}
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
                  {t.expenses.loanPayments}
                </>
              }
              value={money(m.debt.monthly)}
              sub={m.debt.interest > 0 ? t.expenses.interest(money(m.debt.interest)) : undefined}
            />
          )}
          <Line
            label={t.expenses.lifestyleCost}
            value={money(m.lifestyleCost)}
            strong
            sub={
              m.range.hasRanges
                ? t.expenses.usually(formatMoneyRange(m.range.lifestyleCost.low, m.range.lifestyleCost.high, currency))
                : undefined
            }
          />
        </Section>

        <Section icon="nav-savings" title={t.plan.title} editTo="/onboarding/savings">
          <Line label={t.plan.spending} value={money(m.lifestyleCost)} />
          <Line
            label={t.plan.plannedSaving}
            value={money(m.savings.futureSpending)}
            sub={t.plan.futureSpending}
          />
          <Line label={t.plan.longTerm} value={money(m.savings.longTerm)} />
          <Line
            label={t.plan.unallocated}
            value={money(m.breathingRoom)}
            strong
            negative={m.breathingRoom < 0}
            sub={
              m.range.hasRanges && m.income.total > 0
                ? t.plan.expensiveMonth(money(m.range.breathingRoom.low))
                : m.income.total > 0
                  ? t.plan.ofIncome(formatPercent(m.breathingRoom / m.income.total))
                  : undefined
            }
          />
        </Section>

        <Section icon="stat-bank" title={t.position.title} editTo="/onboarding/accounts">
          <Line label={t.position.everyday} value={money(m.position.everyday)} />
          <Line label={t.position.cashSavings} value={money(m.position.cashSavings)} />
          <Line label={t.position.emergency} value={money(m.position.emergency)} />
          <Line label={t.position.investments} value={money(m.position.investments)} />
          {m.position.other > 0 && <Line label={t.position.other} value={money(m.position.other)} />}
          <Line label={t.position.totalAssets} value={money(m.position.totalAssets)} strong={m.position.totalOwned === m.position.totalAssets && m.position.totalDebt === 0} />
          {m.position.home > 0 && <Line label={t.position.home} value={money(m.position.home)} />}
          {m.position.otherProperty > 0 && <Line label={t.position.otherProperty} value={money(m.position.otherProperty)} />}
          {m.position.totalDebt > 0 && <Line label={t.position.loans} value={money(-m.position.totalDebt)} />}
          {(m.position.totalDebt > 0 || m.position.totalOwned !== m.position.totalAssets) && (
            <Line
              label={t.position.netWorth}
              value={money(m.position.netWorth)}
              sub={m.position.csnDebt > 0 ? t.position.excludingCsn(money(m.position.netWorthExcludingCsn)) : undefined}
              strong
            />
          )}
        </Section>
      </div>
    </div>
  );
}
