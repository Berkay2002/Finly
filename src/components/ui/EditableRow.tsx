import { Pencil } from 'lucide-react';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { useT } from '@/i18n';

/**
 * A full-width list row that opens an editor in place. Hover tints the row; pair it with
 * `EditableTitle` so the name turns green and a pencil appears, matching editable rows elsewhere.
 */
export function EditableRow({
  onClick,
  title,
  className,
  children,
}: {
  onClick: () => void;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? t.expenses.editableRow.edit}
      className={clsx(
        'group -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 text-left transition-colors hover:bg-page',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function EditableTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={clsx('flex min-w-0 items-center gap-1.5', className)}>
      <span className="truncate transition-colors group-hover:text-brand-700">{children}</span>
      <Pencil
        size={12}
        aria-hidden
        className="shrink-0 text-brand-600 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      />
    </span>
  );
}
