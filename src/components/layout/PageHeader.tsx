import { Bell, ChevronLeft, ChevronRight, Moon, Sun } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { addDays } from 'date-fns';
import clsx from 'clsx';
import { LanguageSwitch } from '@/components/ui/LanguageSwitch';
import { formatDate, formatMoney, formatMonthYear } from '@/engine/format';
import { useT } from '@/i18n';
import { initialsOf } from '@/lib/image';
import { useCurrency, usePlan, useUpcoming } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';
import { useResolvedTheme, useThemeStore } from '@/store/themeStore';
import { IconButton } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { EmptyState } from '@/components/ui/EmptyState';

export function MonthSelector({ className }: { className?: string }) {
  const viewMonth = useUiStore((s) => s.viewMonth);
  const shift = useUiStore((s) => s.shiftMonth);
  const reset = useUiStore((s) => s.resetMonth);
  const t = useT().layout.month;
  return (
    <div className={clsx('inline-flex h-10 items-center rounded-full px-1', className ?? 'border border-line bg-card')}>
      <button
        type="button"
        aria-label={t.previous}
        onClick={() => shift(-1)}
        className="press inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-page hover:text-ink active:scale-90"
      >
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        onClick={reset}
        title={t.backToCurrent}
        className="tabular min-w-[112px] px-2 text-center text-[13px] font-medium text-ink"
      >
        {formatMonthYear(viewMonth)}
      </button>
      <button
        type="button"
        aria-label={t.next}
        onClick={() => shift(1)}
        className="press inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-page hover:text-ink active:scale-90"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

/** On a phone the month lives in the glass top bar, in the logo's place; see AppShell's `topbar-slot`. */
function TopBarMonth() {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById('topbar-slot')), []);
  return slot ? createPortal(<MonthSelector className="glass h-11 lg:hidden" />, slot) : null;
}

export function NotificationsButton({ className = 'bg-card border border-line' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const t = useT().layout.upcoming;
  const upcoming = useUpcoming(2);
  const currency = useCurrency();
  const soon = upcoming.filter((u) => u.date <= addDays(new Date(), 30));
  return (
    <>
      <div className="relative">
        <IconButton icon={Bell} label={t.button} onClick={() => setOpen(true)} className={className} />
        {soon.length > 0 && (
          <span className="pointer-events-none absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-card" />
        )}
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title={t.title} subtitle={t.subtitle} size="sm">
        {soon.length === 0 ? (
          <EmptyState compact icon="state-empty" title={t.emptyTitle} description={t.emptyDescription} />
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

/** Flips to the opposite of the theme on screen and pins it; Settings offers System too. */
export function ThemeToggleButton({ className = 'bg-card border border-line' }: { className?: string }) {
  const theme = useResolvedTheme();
  const setMode = useThemeStore((s) => s.setMode);
  const t = useT().layout.theme;
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <IconButton
      icon={theme === 'dark' ? Sun : Moon}
      label={next === 'dark' ? t.toDark : t.toLight}
      onClick={() => setMode(next)}
      className={className}
    />
  );
}

export function Avatar({ className }: { className?: string }) {
  const { userName, avatar } = usePlan();
  const t = useT();
  return (
    <Link
      to="/settings"
      aria-label={t.nav.settings}
      className={clsx(
        'inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-brand-solid text-[13px] font-semibold text-white ring-2 ring-card',
        className,
      )}
    >
      {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : initialsOf(userName) || '•'}
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
        {showMonth && <MonthSelector className="border border-line bg-card max-lg:hidden" />}
        {showMonth && <TopBarMonth />}
        <div className="hidden items-center gap-2 lg:flex">
          <LanguageSwitch variant="compact" />
          <ThemeToggleButton />
          <NotificationsButton />
          <Avatar />
        </div>
      </div>
    </header>
  );
}
