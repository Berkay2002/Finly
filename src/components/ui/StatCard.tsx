import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { Accent } from './accent';
import { Icon, type IconSource } from './Icon';
import { IconTile } from './IconTile';
import { isPicture } from './pictures';

export function StatCard({
  icon,
  accent = 'brand',
  label,
  value,
  sub,
  className,
  compact = false,
  onClick,
}: {
  icon: IconSource;
  accent?: Accent;
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  className?: string;
  compact?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  const picture = isPicture(icon);
  return (
    <Tag
      onClick={onClick}
      className={clsx(
        'card flex gap-3 p-4 text-left',
        onClick && 'transition hover:border-line-strong',
        compact ? 'flex-col items-start' : 'flex-col items-start sm:flex-row sm:items-center',
        className,
      )}
    >
      {picture ? (
        <Icon icon={icon} size={compact ? 40 : 44} className="-ml-1" />
      ) : (
        <IconTile icon={icon} accent={accent} size={compact ? 'sm' : 'md'} />
      )}
      <div className="min-w-0">
        <div className="text-[12.5px] text-muted">{label}</div>
        <div className="tabular mt-0.5 whitespace-nowrap text-[19px] font-semibold leading-tight text-ink sm:text-[20px]">
          {value}
        </div>
        {sub && <div className="mt-1 text-[12px] text-muted">{sub}</div>}
      </div>
    </Tag>
  );
}
