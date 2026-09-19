import { Bell, ChevronLeft, ChevronRight, Landmark, Moon, Receipt, Sun } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { addDays, startOfDay } from "date-fns";
import clsx from "clsx";
import { LanguageSwitch } from "@/components/ui/LanguageSwitch";
import { formatDate, formatMoney, formatMonthYear } from "@/engine/format";
import { useT } from "@/i18n";
import { initialsOf } from "@/lib/image";
import { useCurrency, usePlan, useUpcoming } from "@/store/selectors";
import { useUiStore } from "@/store/uiStore";
import { useResolvedTheme, useThemeStore } from "@/store/themeStore";
import { IconButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useBillsStrip } from "@/components/forms/BillsToConfirm";
import { useToSort } from "@/components/bank/SortCard";

export function MonthSelector({ className }: { className?: string }) {
  const viewMonth = useUiStore((s) => s.viewMonth);
  const shift = useUiStore((s) => s.shiftMonth);
  const reset = useUiStore((s) => s.resetMonth);
  const t = useT().layout.month;
  return (
    <div
      className={clsx(
        "inline-flex h-10 items-center rounded-full px-1",
        className ?? "border border-line bg-card",
      )}
    >
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
  useEffect(() => setSlot(document.getElementById("topbar-slot")), []);
  return slot
    ? createPortal(<MonthSelector className="glass h-11 lg:hidden" />, slot)
    : null;
}

export function NotificationsButton({
  className = "bg-card border border-line",
}: {
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // Where the panel goes. It is portalled to <body>: inside the glass island its blur would only see the island.
  const [at, setAt] = useState({ top: 0, right: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const t = useT();
  const currency = useCurrency();
  const bills = useBillsStrip();
  const sort = useToSort();
  const soon = useUpcoming(2).filter((u) => u.date >= startOfDay(new Date()) && u.date <= addDays(new Date(), 30));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const toggle = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 8, right: window.innerWidth - r.right });
    setOpen((o) => !o);
  };

  // The two Home strips, as rows: each opens its sheet on Home (see useOpenParam).
  const todo = [
    bills.pending.length > 0 && {
      key: "bills",
      icon: Receipt,
      title: bills.summary,
      detail: bills.detail,
      to: "/?open=bills",
    },
    sort.count > 0 && {
      key: "sort",
      icon: Landmark,
      title: t.bank.sort.strip(sort.count),
      detail: t.bank.sort.stripDetail(
        sort.names.slice(0, 3),
        Math.max(0, sort.names.length - 3),
      ),
      to: "/?open=sort",
    },
  ].filter((x) => x !== false);
  const count = bills.pending.length + sort.count;
  // The same number on the app icon. iOS shows it once notifications are allowed; elsewhere it is a no-op.
  useEffect(() => {
    const n = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    void (count > 0 ? n.setAppBadge?.(count) : n.clearAppBadge?.())?.catch(() => undefined);
  }, [count]);
  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <div ref={ref} className="relative">
      <IconButton
        icon={Bell}
        label={t.layout.upcoming.button}
        onClick={toggle}
        className={className}
      />
      {count > 0 ? (
        <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white ring-2 ring-card">
          {count}
        </span>
      ) : (
        soon.length > 0 && (
          <span className="pointer-events-none absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-card" />
        )
      )}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50" onClick={() => setOpen(false)}>
            <div
              onClick={(e) => e.stopPropagation()}
              style={at}
              className="glass animate-pop-up fixed w-[min(22rem,calc(100vw-2.5rem))] origin-top-right rounded-[24px] p-2"
            >
              {todo.length > 0 && (
                <>
                  <div className="px-3 pb-1 pt-1.5 text-[12px] font-semibold text-muted">
                    {t.layout.upcoming.needsYou}
                  </div>
                  <ul>
                    {todo.map((row) => (
                      <li key={row.key}>
                        <button
                          type="button"
                          onClick={() => go(row.to)}
                          className={INBOX_ROW}
                        >
                          <Icon icon={row.icon} size={26} strokeWidth={1.8} className="shrink-0 text-ink" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[14px] font-semibold text-ink">
                              {row.title}
                            </span>
                            <span className="block truncate text-[12px] text-muted">
                              {row.detail}
                            </span>
                          </span>
                          <ChevronRight size={16} className="text-faint" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <div className="px-3 pb-1 pt-1.5 text-[12px] font-semibold text-muted">
                {t.layout.upcoming.title}
              </div>
              {soon.length === 0 ? (
                <div className="px-3 pb-2.5 text-[13px] text-muted">
                  {t.layout.upcoming.emptyDescription}
                </div>
              ) : (
                <ul className="max-h-[40vh] overflow-y-auto overscroll-contain">
                  {soon.map((u) => (
                    <li
                      key={u.id}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-medium text-ink">
                          {u.name}
                        </div>
                        <div className="text-[12px] text-muted">
                          {formatDate(u.date)}
                        </div>
                      </div>
                      <div className="tabular text-[13.5px] font-semibold text-ink">
                        {formatMoney(u.amount, currency)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

const INBOX_ROW =
  "press flex w-full items-center gap-3 rounded-[18px] px-3 py-2.5 text-left transition-[background-color,transform] duration-150 hover:bg-page/60 active:scale-[0.97]";

/** Flips to the opposite of the theme on screen and pins it; Settings offers System too. */
export function ThemeToggleButton({
  className = "bg-card border border-line",
}: {
  className?: string;
}) {
  const theme = useResolvedTheme();
  const setMode = useThemeStore((s) => s.setMode);
  const t = useT().layout.theme;
  const next = theme === "dark" ? "light" : "dark";
  return (
    <IconButton
      icon={theme === "dark" ? Sun : Moon}
      label={next === "dark" ? t.toDark : t.toLight}
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
        "inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-brand-solid text-[13px] font-semibold text-white ring-2 ring-card",
        className,
      )}
    >
      {avatar ? (
        <img src={avatar} alt="" className="h-full w-full object-cover" />
      ) : (
        initialsOf(userName) || "•"
      )}
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
    <header
      className={clsx(
        "mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-[24px] font-bold leading-tight tracking-tight text-ink sm:text-[26px]">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-[14px] text-muted">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
        {actions}
        {showMonth && (
          <MonthSelector className="border border-line bg-card max-lg:hidden" />
        )}
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
