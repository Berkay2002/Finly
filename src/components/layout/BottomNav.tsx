import { CalendarDays, ChartPie, Ellipsis, House, Plus, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { useT } from '@/i18n';
import { useUiStore } from '@/store/uiStore';

// Each tab squashes a little under the finger, like a Liquid Glass control; the lens behind the
// active tab is a sibling that slides between the four equal slots and swells while any tab is pressed.
const TAB =
  'press relative z-10 flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] font-medium transition-[color,transform] duration-200 active:scale-90';
const TAB_ACTIVE = 'text-brand-600';

/** True while the page is being scrolled down, false as soon as it comes back up or reaches the top. */
function useScrollingDown() {
  const [down, setDown] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y <= 0 || y < last - 4) setDown(false);
      else if (y > last + 4 && y > 80) setDown(true);
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return down;
}

export function BottomNav({ className }: { className?: string }) {
  const t = useT();
  const tabs: { to: string; label: string; icon: LucideIcon }[] = [
    { to: '/', label: t.nav.home, icon: House },
    { to: '/insights', label: t.nav.insights, icon: ChartPie },
    { to: '/planning', label: t.layout.bottomNav.planning, icon: CalendarDays },
  ];
  const { pathname } = useLocation();
  const setMoreOpen = useUiStore((s) => s.setMoreOpen);
  const setQuickAddOpen = useUiStore((s) => s.setQuickAddOpen);
  const activeIndex = tabs.findIndex((t) => (t.to === '/' ? pathname === '/' : pathname.startsWith(t.to)));
  const moreActive = activeIndex === -1;
  // Like iOS's minimising tab bar: labels fold away while reading down a page and return on the way up.
  const minimized = useScrollingDown();
  const label = (text: string) => (
    <span className={clsx('overflow-hidden transition-[max-height,opacity] duration-200 motion-reduce:transition-none', minimized ? 'max-h-0 opacity-0' : 'max-h-4 opacity-100')}>
      {text}
    </span>
  );

  // Line icons, filled lightly when selected, the way an iOS tab bar swaps to the filled symbol.
  const glyph = (I: LucideIcon, active: boolean) => (
    <I size={24} strokeWidth={active ? 2 : 1.8} fill={active ? 'currentColor' : 'none'} fillOpacity={0.18} className="h-7 w-7 p-0.5" />
  );

  const tab = (to: string, text: string, icon: LucideIcon) => (
    <NavLink
      key={to}
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        clsx(TAB, isActive ? TAB_ACTIVE : 'text-muted')
      }
    >
      {({ isActive }) => (
        <>
          {glyph(icon, isActive)}
          {label(text)}
        </>
      )}
    </NavLink>
  );

  // A floating glass pill for the tabs and a separate glass circle for the add button, in the
  // style of Apple's Liquid Glass tab bar: navigation floats above the content instead of docking to it.
  return (
    <nav className={clsx('safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-3', className)}>
      {/* Scroll edge effect: content fades out before it reaches the bar, so the bar stays legible over anything. */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-32 bg-linear-to-t from-page via-page/70 to-transparent" />
      <div className="pointer-events-auto mx-auto flex max-w-md items-center gap-2.5">
        <div className="glass group relative flex flex-1 items-stretch rounded-full p-1">
          <span
            aria-hidden
            className="lens pointer-events-none absolute inset-y-1 w-[calc((100%-0.5rem)/4)] rounded-full transition-[left,transform] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] group-active:scale-[1.08] motion-reduce:transition-none"
            style={{ left: `calc(0.25rem + (100% - 0.5rem) * ${moreActive ? 3 : activeIndex} / 4)` }}
          />
          {tabs.map((x) => tab(x.to, x.label, x.icon))}
          <button type="button" onClick={() => setMoreOpen(true)} className={clsx(TAB, moreActive ? TAB_ACTIVE : 'text-muted')}>
            {glyph(Ellipsis, moreActive)}
            {label(t.layout.bottomNav.more)}
          </button>
        </div>
        <button
          type="button"
          aria-label={t.layout.bottomNav.add}
          onClick={() => setQuickAddOpen(true)}
          className="glass press inline-flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full text-brand-600 transition-[color,transform] duration-200 hover:text-brand-700 active:scale-90"
        >
          <Plus size={28} strokeWidth={2.2} />
        </button>
      </div>
    </nav>
  );
}
