import { ArrowDown, ArrowUp } from 'lucide-react';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { formatPercent } from '@/engine/format';

function change(before: number | undefined, after: number): number | null {
  if (before === undefined || !Number.isFinite(before) || before === 0) return null;
  const c = (after - before) / Math.abs(before);
  return Number.isFinite(c) ? c : null;
}

/**
 * "+2% vs last month". `invert` flips the colouring for metrics where an increase is bad (costs).
 * Renders nothing when there is no previous value.
 */
export function Delta({
  before,
  after,
  invert = false,
  suffix = 'vs last month',
  className,
}: {
  before: number | undefined;
  after: number;
  invert?: boolean;
  suffix?: string;
  className?: string;
}) {
  const c = change(before, after);
  if (c === null) return null;
  const up = c >= 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={clsx('inline-flex items-center gap-1 text-[12px]', className)}>
      <span className={clsx('inline-flex items-center gap-0.5 font-medium', good ? 'text-positive' : 'text-negative')}>
        <Icon size={12} />
        {up ? '+' : '-'}
        {formatPercent(Math.abs(c))}
      </span>
      <span className="text-muted">{suffix}</span>
    </span>
  );
}

/** Delta when a previous value exists, otherwise the fallback text. */
export function DeltaOr({
  before,
  after,
  fallback,
  invert,
  suffix,
}: {
  before: number | undefined;
  after: number;
  fallback: ReactNode;
  invert?: boolean;
  suffix?: string;
}) {
  return change(before, after) === null ? (
    <>{fallback}</>
  ) : (
    <Delta before={before} after={after} invert={invert} suffix={suffix} />
  );
}
