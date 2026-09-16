import clsx from 'clsx';
import { formatMoney } from '@/engine/format';
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
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-card px-3 py-3">
      <IconTile icon={icon} accent={accent} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-ink">{label}</div>
        <div className="text-[11.5px] text-muted">{sub}</div>
      </div>
      <div className="text-right">
        <div className={clsx('tabular text-[14px] font-semibold', negative ? 'text-negative' : 'text-ink')}>{value}</div>
        <div className="text-[11px] text-muted">per month</div>
      </div>
    </div>
  );
}

export function LiveSummary({ className }: { className?: string }) {
  const m = useMetrics();
  const currency = useCurrency();
  const money = (n: number) => formatMoney(n, currency);
  const stepsFilled = [m.hasIncome, m.hasExpenses, m.hasGoals, m.hasAccounts].filter(Boolean).length;

  return (
    <aside className={clsx('card p-4 sm:p-5', className)}>
      <h2 className="text-[17px] font-semibold text-ink">Your financial overview</h2>
      <p className="mb-4 text-[12.5px] text-muted">Live summary as you build your plan.</p>
      <div className="space-y-2">
        <Row
          icon="stat-income"
          accent="brand"
          label="Reliable income"
          sub={m.income.reliable > 0 ? 'From confirmed sources' : 'Not added yet'}
          value={money(m.income.reliable)}
        />
        <Row
          icon="card-income-change"
          accent="purple"
          label="Variable income"
          sub={m.income.variable > 0 ? 'Estimated average' : 'Not added yet'}
          value={money(m.income.variable)}
        />
        <Row
          icon="stat-cost"
          accent="red"
          label="Normal lifestyle cost"
          sub={m.hasExpenses ? 'All expenses, monthly equivalent' : 'Not added yet'}
          value={money(m.lifestyleCost)}
        />
        <Row
          icon="stat-saving"
          accent="green"
          label="Planned saving"
          sub={m.savings.total > 0 ? 'Saving and investing' : 'Not added yet'}
          value={money(m.savings.total)}
        />
        <Row
          icon="stat-safe-to-spend"
          accent="blue"
          label="Unallocated money"
          sub="Income left after costs & savings"
          value={money(m.breathingRoom)}
          negative={m.breathingRoom < 0}
        />
      </div>
      <div className="mt-4">
        {m.breathingRoom < 0 ? (
          <Callout tone="warning" title="Your plan costs more than your income">
            That is fine to see now. The dashboard will show what is driving it and what is flexible.
          </Callout>
        ) : stepsFilled >= 3 ? (
          <Callout tone="success" icon="goal-target" title="Looking good">
            Your picture is taking shape. Finish the remaining steps to unlock the full dashboard.
          </Callout>
        ) : (
          <Callout tone="tip" icon="goal-target" title="You're on your way!">
            Complete the next steps to get a full picture of your finances and see personalised insights.
          </Callout>
        )}
      </div>
    </aside>
  );
}
