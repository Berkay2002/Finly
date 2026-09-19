import { ChevronRight } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { useT } from "@/i18n";
import { SETTINGS_ITEM, useNavItems } from "@/nav";
import { useUiStore } from "@/store/uiStore";
import { Icon } from "@/components/ui/Icon";

/**
 * A glass panel that rises out of the bottom nav, the way a menu grows from a Liquid Glass control.
 * A tap anywhere else, or Escape, puts it away. Phones only: the sidebar carries these links on desktop.
 */
function GlassPopover({
  open,
  onClose,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  // The nav is shorter once its labels fold away on scroll, so the gap above it is measured, not fixed.
  const [bottom, setBottom] = useState(92);
  useEffect(() => {
    if (!open) return;
    const nav = document.getElementById("bottom-nav");
    if (nav)
      setBottom(window.innerHeight - nav.getBoundingClientRect().top + 8);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-scrim/60" onClick={onClose} />
      {/* The same column as the nav, so a panel can sit over the control that opened it. */}
      <div
        className="absolute inset-x-4 mx-auto flex max-w-md"
        style={{ bottom }}
      >
        <div
          className={clsx("glass animate-pop-up rounded-[28px] p-2", className)}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const ROW =
  "press flex w-full items-center gap-3 rounded-[20px] px-3 py-2.5 text-left transition-[background-color,transform] duration-150 active:scale-[0.97] active:bg-page/60";

export function MoreSheet() {
  const open = useUiStore((s) => s.moreOpen);
  const setOpen = useUiStore((s) => s.setMoreOpen);
  const nav = useNavItems();
  const items = [
    ...nav.filter((i) => !["/", "/insights", "/planning"].includes(i.to)),
    SETTINGS_ITEM,
  ];
  return (
    <GlassPopover
      open={open}
      onClose={() => setOpen(false)}
      className="mr-[70px] flex-1 origin-bottom-right"
    >
      <ul className="max-h-[60vh] overflow-y-auto overscroll-contain">
        {items.map((item) => {
          return (
            <li key={item.to}>
              <Link to={item.to} onClick={() => setOpen(false)} className={ROW}>
                <Icon
                  icon={item.icon}
                  size={26}
                  strokeWidth={1.8}
                  className="shrink-0 text-ink"
                />
                <span className="flex-1 text-[14px] font-medium text-ink">
                  {item.label}
                </span>
                <ChevronRight size={16} className="text-faint" />
              </Link>
            </li>
          );
        })}
      </ul>
    </GlassPopover>
  );
}

export function QuickAddSheet() {
  const open = useUiStore((s) => s.quickAddOpen);
  const setOpen = useUiStore((s) => s.setQuickAddOpen);
  const navigate = useNavigate();
  const t = useT().layout.quickAdd;
  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };
  const actions = [
    {
      label: t.expense.label,
      description: t.expense.description,
      icon: "stat-cost" as const,
      accent: "orange" as const,
      to: "/living?add=1",
    },
    {
      label: t.income.label,
      description: t.income.description,
      icon: "stat-income" as const,
      accent: "green" as const,
      to: "/income?add=1",
    },
    {
      label: t.goal.label,
      description: t.goal.description,
      icon: "nav-savings" as const,
      accent: "purple" as const,
      to: "/savings?add=1",
    },
    {
      label: t.account.label,
      description: t.account.description,
      icon: "account-other" as const,
      accent: "blue" as const,
      to: "/accounts?add=1",
    },
    {
      label: t.loan.label,
      description: t.loan.description,
      icon: "stat-bank" as const,
      accent: "red" as const,
      to: "/loans?add=1",
    },
  ];
  return (
    <GlassPopover
      open={open}
      onClose={() => setOpen(false)}
      className="ml-auto w-[19rem] max-w-full origin-bottom-right"
    >
      <div className="px-3 pb-1 pt-2 text-[12px] font-semibold text-muted">
        {t.title}
      </div>
      <ul>
        {actions.map((a) => (
          <li key={a.label}>
            <button type="button" onClick={() => go(a.to)} className={ROW}>
              <Icon
                icon={a.icon}
                size={26}
                strokeWidth={1.8}
                className="shrink-0 text-ink"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-ink">
                  {a.label}
                </span>
                <span className="block truncate text-[12px] text-muted">
                  {a.description}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </GlassPopover>
  );
}
