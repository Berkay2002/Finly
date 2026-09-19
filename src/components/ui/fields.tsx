import { Check, ChevronDown } from 'lucide-react';
import {
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

const fieldBase =
  'w-full rounded-xl border border-line bg-card px-3 text-[13.5px] text-ink placeholder:text-faint transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';

export function Label({ children, htmlFor, hint }: { children: ReactNode; htmlFor?: string; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-[12.5px] font-medium text-ink-soft">
      {children}
      {hint && <span className="ml-1 font-normal text-faint">{hint}</span>}
    </label>
  );
}

export function TextField({
  label,
  hint,
  className,
  inputClassName,
  ...rest
}: { label?: ReactNode; hint?: ReactNode; inputClassName?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={id} hint={hint}>
          {label}
        </Label>
      )}
      <input id={id} className={clsx(fieldBase, 'h-10', inputClassName)} {...rest} />
    </div>
  );
}

export function MoneyField({
  label,
  hint,
  currency = 'SEK',
  value,
  onValueChange,
  className,
  inputClassName,
  size = 'md',
  ...rest
}: {
  label?: ReactNode;
  hint?: ReactNode;
  currency?: string;
  value: number;
  onValueChange: (v: number) => void;
  inputClassName?: string;
  size?: 'sm' | 'md' | 'lg';
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'>) {
  const id = useId();
  const h = size === 'sm' ? 'h-9' : size === 'lg' ? 'h-14 text-[20px] font-semibold' : 'h-10';
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={id} hint={hint}>
          {label}
        </Label>
      )}
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={Number.isFinite(value) && value !== 0 ? value : ''}
          placeholder="0"
          onChange={(e) => {
            const n = e.target.value === '' ? 0 : Number(e.target.value);
            onValueChange(Number.isFinite(n) ? n : 0);
          }}
          onFocus={(e) => e.target.select()}
          className={clsx(fieldBase, 'tabular pr-12 text-right', h, inputClassName)}
          {...rest}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12.5px] font-medium text-muted">
          {currency}
        </span>
      </div>
    </div>
  );
}

/** A small count, e.g. how many times a week something is bought. Accepts halves (1.5 a week). */
export function CountField({
  label,
  hint,
  value,
  onValueChange,
  className,
  size = 'md',
  ...rest
}: {
  label?: ReactNode;
  hint?: ReactNode;
  value: number;
  onValueChange: (v: number) => void;
  size?: 'sm' | 'md';
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'>) {
  const id = useId();
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={id} hint={hint}>
          {label}
        </Label>
      )}
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={Number.isFinite(value) && value !== 0 ? value : ''}
        placeholder="0"
        onChange={(e) => {
          const n = e.target.value === '' ? 0 : Number(e.target.value);
          onValueChange(Number.isFinite(n) ? Math.max(0, n) : 0);
        }}
        onFocus={(e) => e.target.select()}
        className={clsx(fieldBase, 'tabular px-2 text-center', size === 'sm' ? 'h-9' : 'h-10')}
        {...rest}
      />
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  hint,
  value,
  onValueChange,
  options,
  className,
  selectClassName,
  size = 'md',
  disabled,
  placeholder,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  value: T;
  onValueChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  selectClassName?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  const listId = `${id}-listbox`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const estimate = Math.min(options.length, 8) * 36 + 12;
    const below = window.innerHeight - r.bottom;
    const up = below < estimate + 8 && r.top > below;
    // The list is never narrower than its labels need, and stays on screen when the trigger sits at the right edge.
    const width = Math.max(r.width, Math.min(280, window.innerWidth - 16));
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), width, up });
  }, [options.length]);

  const openList = () => {
    if (disabled) return;
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    place();
    setOpen(true);
  };

  const close = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const choose = (i: number) => {
    const o = options[i];
    if (o) onValueChange(o.value);
    close(true);
  };

  // Close on outside click, reposition on scroll/resize.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || listRef.current?.contains(t)) return;
      close();
    };
    const onScroll = (e: Event) => {
      if (listRef.current?.contains(e.target as Node)) return;
      place();
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open, close, place]);

  // Keep the active option in view while navigating with the keyboard.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((i) => Math.min(options.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
        break;
      case 'Home':
        e.preventDefault();
        setActive(0);
        break;
      case 'End':
        e.preventDefault();
        setActive(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        choose(active);
        break;
      case 'Escape':
        e.preventDefault();
        close(true);
        break;
      case 'Tab':
        close();
        break;
      default: {
        // Type-ahead: jump to the next option starting with the pressed letter.
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const k = e.key.toLowerCase();
          const n = options.length;
          for (let step = 1; step <= n; step++) {
            const i = (active + step) % n;
            if (options[i].label.toLowerCase().startsWith(k)) {
              setActive(i);
              break;
            }
          }
        }
      }
    }
  };

  return (
    <div className={className}>
      {label && (
        <Label htmlFor={id} hint={hint}>
          {label}
        </Label>
      )}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        className={clsx(
          fieldBase,
          'flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:bg-field disabled:text-muted',
          size === 'sm' ? 'h-9' : 'h-10',
          open && 'border-brand-500 ring-2 ring-brand-100',
          selectClassName,
        )}
      >
        <span className={clsx('truncate', !selected && 'text-faint')}>{selected?.label ?? placeholder ?? ''}</span>
        <ChevronDown
          size={15}
          className={clsx('shrink-0 text-muted transition-transform duration-150', open && 'rotate-180')}
        />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={id}
            aria-activedescendant={`${listId}-${active}`}
            style={{
              position: 'fixed',
              left: pos.left,
              width: pos.width,
              ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
            }}
            className={clsx(
              'z-[60] max-h-[300px] overflow-y-auto rounded-xl border border-line bg-card p-1 shadow-island',
              'animate-select-in',
              pos.up ? 'origin-bottom' : 'origin-top',
            )}
          >
            {options.map((o, i) => {
              const isSelected = i === selectedIndex;
              const isActive = i === active;
              return (
                <div
                  key={o.value}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(i)}
                  className={clsx(
                    'flex h-9 cursor-pointer select-none items-center justify-between gap-2 rounded-lg px-2.5 text-[13.5px]',
                    isActive ? 'bg-page text-ink' : 'text-ink',
                    isSelected && 'font-medium',
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {isSelected && <Check size={14} className="shrink-0 text-brand-600" />}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function DateField({
  label,
  hint,
  className,
  ...rest
}: { label?: ReactNode; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={id} hint={hint}>
          {label}
        </Label>
      )}
      <input id={id} type="date" className={clsx(fieldBase, 'h-10')} {...rest} />
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx('flex cursor-pointer items-center justify-between gap-3', className)}>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-[13.5px] font-medium text-ink">{label}</span>}
          {description && <span className="block text-[12px] text-muted">{description}</span>}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative h-6 w-11 shrink-0 rounded-full transition',
          checked ? 'bg-brand-solid' : 'bg-line-strong',
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </button>
    </label>
  );
}

/** The raised capsule behind the chosen option of a segmented control; it slides between equal-width slots. */
function SlidingThumb({ index, count, pad }: { index: number; count: number; pad: string }) {
  if (index < 0) return null;
  const slot = `(100% - 2 * ${pad}) / ${count}`;
  return (
    <span
      aria-hidden
      className="absolute rounded-full bg-card shadow-sm transition-[left] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
      style={{ top: pad, bottom: pad, width: `calc(${slot})`, left: `calc(${pad} + ${slot} * ${index})` }}
    />
  );
}

/** Two-state pill used for fixed/variable, essential/optional, committed/flexible. */
export function TogglePill<T extends string>({
  value,
  onChange,
  options,
  size = 'sm',
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [{ value: T; label: string }, { value: T; label: string }];
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div className={clsx('relative inline-grid grid-cols-2 rounded-full border border-line bg-page p-0.5', className)}>
      <SlidingThumb index={options.findIndex((o) => o.value === value)} count={2} pad="0.125rem" />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            'press relative z-10 rounded-full font-medium transition-colors',
            size === 'sm' ? 'px-2 py-0.5 text-[11.5px]' : 'px-3 py-1 text-[12.5px]',
            value === o.value ? 'text-ink' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div className={clsx('relative flex w-full rounded-full border border-line bg-page p-1', className)}>
      <SlidingThumb index={options.findIndex((o) => o.value === value)} count={options.length} pad="0.25rem" />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            'press relative z-10 flex-1 whitespace-nowrap rounded-full px-2 py-1.5 text-[12.5px] font-medium transition-colors',
            value === o.value ? 'text-ink' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
