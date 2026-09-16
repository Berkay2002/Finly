import type { ReactNode } from 'react';
import clsx from 'clsx';
import { IconTile } from './IconTile';
import type { IconSource } from './Icon';
import type { Accent } from './accent';

export function EmptyState({
  icon,
  accent = 'brand',
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon: IconSource;
  accent?: Accent;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 py-6' : 'gap-3 py-10',
        className,
      )}
    >
      <IconTile icon={icon} accent={accent} size={compact ? 'md' : 'lg'} />
      <div>
        <div className="text-[14px] font-semibold text-ink">{title}</div>
        {description && <div className="mx-auto mt-1 max-w-sm text-[13px] text-muted">{description}</div>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
