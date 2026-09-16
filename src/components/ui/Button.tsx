import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
  secondary: 'bg-card text-ink border border-line hover:bg-page',
  ghost: 'text-ink-soft hover:bg-page',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
  danger: 'bg-red-100 text-red-500 hover:bg-red-200',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[12.5px]',
  md: 'h-10 px-4 text-[13.5px]',
  lg: 'h-12 px-5 text-[14.5px]',
};

interface BaseProps {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  children?: ReactNode;
  className?: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  children,
  className,
  ...rest
}: BaseProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={clsx(base, variants[variant], sizes[size], className)} {...rest}>
      {Icon && <Icon size={size === 'sm' ? 14 : 16} />}
      {children}
      {IconRight && <IconRight size={size === 'sm' ? 14 : 16} />}
    </button>
  );
}

export function LinkButton({
  to,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  children,
  className,
}: BaseProps & { to: string }) {
  return (
    <Link to={to} className={clsx(base, variants[variant], sizes[size], className)}>
      {Icon && <Icon size={size === 'sm' ? 14 : 16} />}
      {children}
      {IconRight && <IconRight size={size === 'sm' ? 14 : 16} />}
    </Link>
  );
}

export function IconButton({
  icon: Icon,
  label,
  className,
  size = 18,
  ...rest
}: { icon: LucideIcon; label: string; size?: number } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-page hover:text-ink',
        className,
      )}
      {...rest}
    >
      <Icon size={size} />
    </button>
  );
}
