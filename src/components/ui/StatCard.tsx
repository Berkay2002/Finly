import type { ReactNode } from "react";
import clsx from "clsx";
import type { Accent } from "./accent";
import { change, DeltaBadge } from "./Delta";
import { Icon, type IconSource } from "./Icon";
import { IconTile } from "./IconTile";
import { isPicture } from "./pictures";
import { useT } from "@/i18n";

/** Month-over-month comparison: the badge sits beside the value, the "vs last month" text replaces `sub`. */
export interface Trend {
  before: number | undefined;
  after: number;
  /** An increase is bad (costs). */
  invert?: boolean;
  suffix?: ReactNode;
}

export function StatCard({
  icon,
  accent = "brand",
  label,
  value,
  sub,
  trend,
  className,
  compact = false,
  onClick,
}: {
  icon: IconSource;
  accent?: Accent;
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  /** When there is a previous value, the badge goes next to the value and `sub` is replaced by the trend text. */
  trend?: Trend;
  className?: string;
  compact?: boolean;
  onClick?: () => void;
}) {
  const t = useT();
  const Tag = onClick ? "button" : "div";
  const picture = isPicture(icon);
  const c = trend ? change(trend.before, trend.after) : null;
  const foot = c === null ? sub : (trend?.suffix ?? t.ui.delta.vsLastMonth);
  return (
    <Tag
      onClick={onClick}
      className={clsx(
        // On a phone the foot line runs under the icon for the full card width; nothing here ever wraps.
        "card p-4 text-left max-sm:grid max-sm:grid-cols-[auto_1fr] max-sm:items-center max-sm:gap-x-2 sm:flex sm:gap-3",
        onClick && "transition hover:border-line-strong",
        compact ? "sm:flex-col sm:items-start" : "sm:flex-row sm:items-center",
        className,
      )}
    >
      {picture ? (
        <Icon
          icon={icon}
          size={compact ? 40 : 44}
          className="-ml-1 max-sm:row-span-2 max-sm:ml-0 max-sm:h-9! max-sm:w-9!"
        />
      ) : (
        <IconTile
          icon={icon}
          accent={accent}
          size={compact ? "sm" : "md"}
          className="max-sm:row-span-2 max-sm:h-9 max-sm:w-9"
        />
      )}
      <div className="min-w-0 max-sm:contents">
        <div className="truncate text-[12.5px] text-muted">{label}</div>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 max-sm:min-w-0">
          <span className="tabular whitespace-nowrap text-[16px] font-semibold leading-tight text-ink sm:text-[20px]">
            {value}
          </span>
          {c !== null && <DeltaBadge c={c} invert={trend?.invert} />}
        </div>
        {foot && (
          <div className="mt-1 truncate text-[12px] text-muted max-sm:col-span-2">
            {foot}
          </div>
        )}
      </div>
    </Tag>
  );
}
