import { ArrowRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return <section className={clsx('card', padded && 'p-4 sm:p-5', className)}>{children}</section>;
}

const pill =
  'inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-medium text-brand-700 transition hover:bg-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200';

export function CardHeader({
  title,
  subtitle,
  action,
  actionTo,
  onAction,
  actionIcon,
  icon,
  className,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  /** Renders `action` as a pill link to this route. */
  actionTo?: string;
  /** Renders `action` as a pill button that acts in place instead of navigating. */
  onAction?: () => void;
  actionIcon?: LucideIcon;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const ActionIcon = actionIcon ?? ArrowRight;
  return (
    <div className={clsx('mb-4 flex items-start justify-between gap-3', className)}>
      <div className={clsx('flex min-w-0 gap-3', subtitle ? 'items-start' : 'items-center')}>
        {icon}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-tight text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {children}
      {actionTo && action && (
        <Link to={actionTo} className={pill}>
          {action}
          <ActionIcon size={13} />
        </Link>
      )}
      {!actionTo && onAction && action && (
        <button type="button" onClick={onAction} className={pill}>
          {action}
          <ActionIcon size={13} />
        </button>
      )}
      {!actionTo && !onAction && action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={clsx('border-line', className)} />;
}
