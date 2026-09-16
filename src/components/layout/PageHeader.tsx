import { Bell, ChevronLeft, ChevronRight } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays } from 'date-fns';
import clsx from 'clsx';
import { formatDate, formatMoney, formatMonthYear } from '@/engine/format';
import { useCurrency, usePlan, useUpcoming } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';
import { IconButton } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { EmptyState } from '@/components/ui/EmptyState';

export function MonthSelector({ className }: { className?: string }) {
  const viewMonth = useUiStore((s) => s.viewMonth);
  const shift = useUiStore((s) => s.shiftMonth);
  const reset = useUiStore((s) => s.resetMonth);
  return (
    <div className={clsx('inline-flex h-10 items-center rounded-xl border border-line bg-card px-1', className)}>
      <button
        type="button"
        aria-label="Previous month"
        onClick={() => shift(-1)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-page hover:text-ink"
      >
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        onClick={reset}
        title="Back to the current month"
        className="tabular min-w-[112px] px-2 text-center text-[13px] font-medium text-ink"
      >
        {formatMonthYear(viewMonth)}
      </button>
      <button
        type="button"
        aria-label="Next month"
        onClick={() => shift(1)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-page hover:text-ink"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

export function NotificationsButton() {
  const [open, setOpen] = useState(false);
  const upcoming = useUpcoming(2);
  const currency = useCurrency();
  const soon = upcoming.filter((u) => u.date <= addDays(new Date(), 30));
  return (
    <>
      <div className="relative">
        <IconButton icon={Bell} label="Upcoming" onClick={() => setOpen(true)} className="bg-card border border-line" />
        {soon.length > 0 && (
          <span className="pointer-events-none absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-card" />
        )}
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Coming up" subtitle="Irregular costs in the next 30 days" size="sm">
        {soon.length === 0 ? (
          <EmptyState compact icon="state-empty" title="Nothing unusual ahead" description="No irregular expenses fall in the next 30 days." />
        ) : (
          <ul className="divide-y divide-line">
            {soon.map((u) => (
              <li key={u.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-[13.5px] font-medium text-ink">{u.name}</div>
                  <div className="text-[12px] text-muted">{formatDate(u.date)}</div>
                </div>
                <div className="tabular text-[13.5px] font-semibold text-ink">{formatMoney(u.amount, currency)}</div>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </>
  );
}

export function Avatar({ className }: { className?: string }) {
  const name = usePlan().userName;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <Link
      to="/settings"
      aria-label="Settings"
      className={clsx(
        'inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-[13px] font-semibold text-white ring-2 ring-card',
        className,
      )}
    >
      {initials || '•'}
    </Link>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  showMonth = true,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  showMonth?: boolean;
  className?: string;
}) {
  return (
    <header className={clsx('mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between', className)}>
      <div className="min-w-0">
        <h1 className="text-[24px] font-bold leading-tight tracking-tight text-ink sm:text-[26px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[14px] text-muted">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
        {actions}
        {showMonth && <MonthSelector />}
        <div className="hidden items-center gap-2 lg:flex">
          <NotificationsButton />
          <Avatar />
        </div>
      </div>
    </header>
  );
}
