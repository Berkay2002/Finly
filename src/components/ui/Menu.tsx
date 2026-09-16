import { MoreVertical, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
}

export function KebabMenu({ items, className }: { items: MenuItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} className={clsx('relative', className)}>
      <button
        type="button"
        aria-label="More options"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-page hover:text-ink"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 min-w-[160px] overflow-hidden rounded-xl border border-line bg-card py-1 shadow-lg">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className={clsx(
                'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-page',
                it.danger ? 'text-red-500' : 'text-ink',
              )}
            >
              {it.icon && <it.icon size={14} />}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
