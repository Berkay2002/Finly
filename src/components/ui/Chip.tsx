import type { ReactNode } from 'react';
import clsx from 'clsx';

export function Chip({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'brand' | 'blue' | 'orange' | 'red' | 'purple';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-page text-muted',
    brand: 'bg-brand-50 text-brand-700',
    blue: 'bg-blue-100 text-blue-500',
    orange: 'bg-orange-100 text-orange-500',
    red: 'bg-red-100 text-red-500',
    purple: 'bg-purple-100 text-purple-500',
  };
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-none',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
