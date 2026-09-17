import { ArrowDown, ArrowUp } from 'lucide-react';
import clsx from 'clsx';
import { formatPercent } from '@/engine/format';
import { useT } from '@/i18n';

export function change(before: number | undefined, after: number): number | null {
  if (before === undefined || !Number.isFinite(before) || before === 0) return null;
  const c = (after - before) / Math.abs(before);
  // Anything that would render as "0 %" is not worth showing: the caller's fallback text says more.
  return Number.isFinite(c) && Math.abs(c) >= 0.005 ? c : null;
}

/** Just the coloured "↓ -3 %" part, for placing next to a value. */
export function DeltaBadge({ c, invert = false, className }: { c: number; invert?: boolean; className?: string }) {
  const up = c >= 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={clsx('whitespace-nowrap text-[12px] font-medium', good ? 'text-positive' : 'text-negative', className)}>
      <Icon size={12} className="mr-0.5 inline-block align-[-2px]" aria-hidden />
      {up ? '+' : '-'}
      {formatPercent(Math.abs(c))}
    </span>
  );
}

/**
 * "+2% vs last month". `invert` flips the colouring for metrics where an increase is bad (costs).
 * Renders nothing when there is no previous value.
 */
export function Delta({
  before,
  after,
  invert = false,
  suffix,
  className,
}: {
  before: number | undefined;
  after: number;
  invert?: boolean;
  suffix?: string;
  className?: string;
}) {
  const t = useT();
  const c = change(before, after);
  if (c === null) return null;
  // Plain inline text so a long suffix wraps like a sentence instead of stacking beside the number.
  return (
    <span className={clsx('text-[12px]', className)}>
      <DeltaBadge c={c} invert={invert} /> <span className="text-muted">{suffix ?? t.ui.delta.vsLastMonth}</span>
    </span>
  );
}
