import clsx from 'clsx';
import { ACCENT, type Accent } from './accent';

export function ProgressBar({
  value,
  accent = 'brand',
  className,
  height = 'md',
}: {
  /** 0..1 */
  value: number;
  accent?: Accent;
  className?: string;
  height?: 'sm' | 'md';
}) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100;
  return (
    <div className={clsx('w-full overflow-hidden rounded-full bg-line', height === 'sm' ? 'h-1.5' : 'h-2', className)}>
      <div className={clsx('h-full rounded-full transition-all', ACCENT[accent].bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Two-segment bar, e.g. reliable vs variable income. */
export function SplitBar({
  a,
  b,
  accentA = 'brand',
  accentB = 'blue',
  className,
}: {
  a: number;
  b: number;
  accentA?: Accent;
  accentB?: Accent;
  className?: string;
}) {
  const total = a + b;
  const pa = total > 0 ? (a / total) * 100 : 0;
  return (
    <div className={clsx('flex h-2.5 w-full overflow-hidden rounded-full bg-line', className)}>
      <div className={clsx('h-full', ACCENT[accentA].bar)} style={{ width: `${pa}%` }} />
      <div className={clsx('h-full', ACCENT[accentB].bar)} style={{ width: `${100 - pa}%` }} />
    </div>
  );
}

/** Multi-segment bar for allocation. */
export function StackedBar({
  segments,
  className,
}: {
  segments: { value: number; accent: Accent }[];
  className?: string;
}) {
  const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0);
  return (
    <div className={clsx('flex h-3 w-full overflow-hidden rounded-full bg-line', className)}>
      {segments.map((s, i) => (
        <div
          key={i}
          className={clsx('h-full', ACCENT[s.accent].bar)}
          style={{ width: total > 0 ? `${(Math.max(0, s.value) / total) * 100}%` : '0%' }}
        />
      ))}
    </div>
  );
}
