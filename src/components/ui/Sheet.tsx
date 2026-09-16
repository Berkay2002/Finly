import { X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useT } from '@/i18n';
import { IconButton } from './Button';

const SCROLL_KEYS = new Set([' ', 'PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown']);

/**
 * Bottom sheet on small screens, centred dialog on larger ones.
 *
 * The page behind the sheet is left untouched: no `overflow: hidden` on the body, so the
 * page scrollbar stays exactly where it is and nothing shifts. Background scrolling is
 * blocked by swallowing wheel, touch and key events that would reach the page instead of
 * the sheet's own scroll area.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const t = useT();
  const overlayRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const overlay = overlayRef.current;
    if (!overlay) return;

    const insideScroller = (target: EventTarget | null) =>
      target instanceof Node && scrollerRef.current?.contains(target);
    const insideField = (target: EventTarget | null) =>
      target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable]');

    const blockScroll = (e: Event) => {
      if (insideScroller(e.target)) return; // the sheet body scrolls; overscroll-contain stops chaining
      e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (SCROLL_KEYS.has(e.key) && !insideScroller(e.target) && !insideField(e.target)) e.preventDefault();
    };

    overlay.addEventListener('wheel', blockScroll, { passive: false });
    overlay.addEventListener('touchmove', blockScroll, { passive: false });
    document.addEventListener('keydown', onKey);
    return () => {
      overlay.removeEventListener('wheel', blockScroll);
      overlay.removeEventListener('touchmove', blockScroll);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const width = size === 'sm' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg';

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end justify-center overscroll-contain sm:items-center sm:p-6"
      role="dialog"
      aria-modal
    >
      <div className="absolute inset-0 bg-scrim backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={clsx(
          'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl',
          width,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 pb-3 pt-4">
          <div className="min-w-0">
            {title && <h2 className="text-[16px] font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
          </div>
          <IconButton icon={X} label={t.ui.sheet.close} onClick={onClose} className="-mr-2 -mt-1" />
        </div>
        <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {children}
        </div>
        {footer && <div className="safe-bottom border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
