import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Icon } from '@/components/ui/Icon';

export function Logo({ className, to = '/' }: { className?: string; to?: string }) {
  return (
    <Link to={to} className={clsx('inline-flex items-center gap-2', className)}>
      <Icon icon="logo-mark" size={34} />
      <span className="text-[20px] font-bold tracking-tight text-ink">Finly</span>
    </Link>
  );
}
