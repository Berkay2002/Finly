import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { SETTINGS_ITEM, useNavItems, type NavItem } from '@/nav';
import { Icon } from '@/components/ui/Icon';
import { Logo } from './Logo';

function Item({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition',
          isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-soft hover:bg-page hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            icon={item.icon}
            size={18}
            pictureScale={1.35}
            className={isActive ? 'text-brand-600' : 'text-muted'}
          />
          <span className="truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

export function Sidebar({ className }: { className?: string }) {
  const items = useNavItems();
  return (
    <aside
      className={clsx(
        'sticky top-4 my-4 ml-4 h-[calc(100vh-2rem)] w-[232px] shrink-0 flex-col rounded-3xl border border-line bg-card px-4 py-5 shadow-island',
        className,
      )}
    >
      <Logo className="mb-6 px-2" />
      <nav className="flex-1 space-y-0.5 overflow-y-auto scrollbar-none">
        {items.map((item) => (
          <Item key={item.to} item={item} />
        ))}
      </nav>
      <div className="mt-4 border-t border-line pt-4">
        <Item item={SETTINGS_ITEM} />
      </div>
    </aside>
  );
}
