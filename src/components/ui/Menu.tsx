import { MoreVertical, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useT } from '@/i18n';

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
}

export function KebabMenu({ items, className }: { items: MenuItem[]; className?: string }) {
  const t = useT();
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
        aria-label={t.ui.menu.moreOptions}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-page hover:text-ink"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="glass animate-pop-up absolute right-0 z-20 mt-1 min-w-[180px] origin-top-right rounded-2xl p-1">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className={clsx(
                'press flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] transition-[background-color,transform] hover:bg-page/60 active:scale-[0.97]',
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
