import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Icon, type IconSource } from './Icon';
import { isPicture } from './pictures';

type Tone = 'success' | 'info' | 'warning' | 'tip' | 'neutral';

const tones: Record<Tone, { wrap: string; icon: string; Icon: IconSource }> = {
  success: { wrap: 'bg-brand-50 text-brand-800', icon: 'bg-brand-100 text-brand-600', Icon: 'state-success' },
  info: { wrap: 'bg-purple-100 text-indigo-500', icon: 'bg-card text-purple-500', Icon: Info },
  warning: { wrap: 'bg-orange-100 text-orange-800', icon: 'bg-card text-orange-500', Icon: 'state-warning' },
  tip: { wrap: 'bg-brand-50 text-brand-800', icon: 'bg-card text-brand-600', Icon: 'state-tip' },
  neutral: { wrap: 'bg-page text-ink-soft', icon: 'bg-card text-muted', Icon: Info },
};

export function Callout({
  tone = 'success',
  title,
  children,
  icon,
  className,
  action,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  icon?: IconSource;
  className?: string;
  action?: ReactNode;
}) {
  const t = tones[tone];
  const source = icon ?? t.Icon;
  const picture = isPicture(source);
  return (
    <div className={clsx('flex items-center gap-3 rounded-xl px-3.5 py-3', t.wrap, className)}>
      {picture ? (
        <Icon icon={source} size={title ? 48 : 30} className={title ? '-my-1' : '-my-0.5'} />
      ) : (
        <span className={clsx('inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full', t.icon)}>
          <Icon icon={source} size={15} />
        </span>
      )}
      <div className="min-w-0 flex-1 text-[13px] leading-snug">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={clsx(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
