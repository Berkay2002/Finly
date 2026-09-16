import { Menu, Plus } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { useUiStore } from '@/store/uiStore';
import { Icon, type IconSource } from '@/components/ui/Icon';

const tabs: { to: string; label: string; icon: IconSource }[] = [
  { to: '/', label: 'Home', icon: 'nav-home' },
  { to: '/insights', label: 'Insights', icon: 'nav-insights' },
  { to: '/planning', label: 'Planning', icon: 'nav-planning' },
];

export function BottomNav({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const setMoreOpen = useUiStore((s) => s.setMoreOpen);
  const setQuickAddOpen = useUiStore((s) => s.setQuickAddOpen);
  const moreActive = !tabs.some((t) => (t.to === '/' ? pathname === '/' : pathname.startsWith(t.to)));

  const tab = (to: string, label: string, icon: IconSource) => (
    <NavLink
      key={to}
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        clsx(
          'flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium',
          isActive ? 'text-brand-600' : 'text-muted',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon icon={icon} size={22} strokeWidth={1.9} pictureScale={1.3} className={isActive ? '' : 'opacity-70'} />
          {label}
        </>
      )}
    </NavLink>
  );

  return (
    <nav
      className={clsx(
        'safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur',
        className,
      )}
    >
      <div className="mx-auto flex max-w-lg items-stretch px-2">
        {tab(tabs[0].to, tabs[0].label, tabs[0].icon)}
        {tab(tabs[1].to, tabs[1].label, tabs[1].icon)}
        <div className="flex flex-1 items-center justify-center">
          <button
            type="button"
            aria-label="Add"
            onClick={() => setQuickAddOpen(true)}
            className="-mt-7 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-700"
          >
            <Plus size={26} />
          </button>
        </div>
        {tab(tabs[2].to, tabs[2].label, tabs[2].icon)}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={clsx(
            'flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium',
            moreActive ? 'text-brand-600' : 'text-muted',
          )}
        >
          <Menu size={22} strokeWidth={1.9} className={clsx(moreActive ? '' : 'opacity-70', 'h-[29px] w-[29px] p-[3px]')} />
          More
        </button>
      </div>
    </nav>
  );
}
