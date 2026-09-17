import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Icon } from '@/components/ui/Icon';

/** The green F mark with the wordmark set in the UI font, so it sits right in both themes. */
export function Logo({ className, to = '/', size = 'md' }: { className?: string; to?: string; size?: 'md' | 'lg' }) {
  const lg = size === 'lg';
  return (
    <Link to={to} className={clsx('inline-flex items-center', lg ? 'gap-2.5' : 'gap-2', className)}>
      <Icon icon="logo-mark" size={lg ? 34 : 28} />
      <span className={clsx('font-bold tracking-tight text-ink', lg ? 'text-[26px]' : 'text-[20px]')}>Finly</span>
    </Link>
  );
}
