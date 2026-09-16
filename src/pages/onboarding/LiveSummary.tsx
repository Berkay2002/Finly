import clsx from 'clsx';
import { formatMoney, formatMoneyRange } from '@/engine/format';
import { useT } from '@/i18n';
import { useCurrency, useMetrics } from '@/store/selectors';
import type { Accent } from '@/components/ui/accent';
import { Callout } from '@/components/ui/Callout';
import { IconTile } from '@/components/ui/IconTile';
import type { IconSource } from '@/components/ui/Icon';

function Row({
  icon,
  accent,
  label,
  sub,
  value,
  negative,
}: {
  icon: IconSource;
  accent: Accent;
  label: string;
  sub: string;
  value: string;
  negative?: boolean;
}) {
  const t = useT().summary.live;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-card px-3 py-3">
      <IconTile icon={icon} accent={accent} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-ink">{label}</div>
        <div className="text-[11.5px] text-muted">{sub}</div>
      </div>
      <div className="text-right">
        <div className={clsx('tabular text-[14px] font-semibold', negative ? 'text-negative' : 'text-ink')}>{value}</div>
        <div className="text-[11px] text-muted">{t.perMonth}</div>
      </div>
    </div>
  );
}

export function LiveSummary({ className }: { className?: string }) {
  const m = useMetrics();
  const currency = useCurrency();
  const money = (n: number) => formatMoney(n, currency);
  const t = useT().summary.live;
  const stepsFilled = [m.hasIncome, m.hasExpenses, m.hasGoals, m.hasAccounts].filter(Boolean).length;

  return (
    <aside className={clsx('card p-4 sm:p-5', className)}>
      <h2 className="text-[17px] font-semibold text-ink">{t.title}</h2>
      <p className="mb-4 text-[12.5px] text-muted">{t.subtitle}</p>
      <div className="space-y-2">
        <Row
          icon="stat-income"
          accent="brand"
          label={t.reliableIncome}
          sub={m.income.reliable > 0 ? t.fromConfirmed : t.notAdded}
          value={money(m.income.reliable)}
        />
        <Row
          icon="card-income-change"
          accent="purple"
          label={t.variableIncome}
          sub={m.income.variable > 0 ? t.estimatedAverage : t.notAdded}
          value={money(m.income.variable)}
        />
        <Row
          icon="stat-cost"
          accent="red"
          label={t.lifestyleCost}
          sub={
            !m.hasExpenses
              ? t.notAdded
              : m.range.hasRanges
                ? t.usually(formatMoneyRange(m.range.lifestyleCost.low, m.range.lifestyleCost.high, currency))
                : t.allExpenses
          }
          value={money(m.lifestyleCost)}
        />
        <Row
          icon="stat-saving"
          accent="green"
          label={t.plannedSaving}
          sub={m.savings.total > 0 ? t.savingAndInvesting : t.notAdded}
          value={money(m.savings.total)}
        />
        <Row
          icon="stat-safe-to-spend"
          accent="blue"
          label={t.unallocated}
          sub={t.unallocatedSub}
          value={money(m.breathingRoom)}
          negative={m.breathingRoom < 0}
        />
      </div>
      <div className="mt-4">
        {m.breathingRoom < 0 ? (
          <Callout tone="warning" title={t.overTitle}>
            {t.overBody}
          </Callout>
        ) : stepsFilled >= 3 ? (
          <Callout tone="success" icon="goal-target" title={t.goodTitle}>
            {t.goodBody}
          </Callout>
        ) : (
          <Callout tone="tip" icon="goal-target" title={t.startTitle}>
            {t.startBody}
          </Callout>
        )}
      </div>
    </aside>
  );
}
