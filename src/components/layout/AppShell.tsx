import { Outlet } from 'react-router-dom';
import { LanguageSwitch } from '@/components/ui/LanguageSwitch';
import { useBankSync } from '@/bank/useBankSync';
import { useMonthClose } from '@/store/useMonthClose';
import { usePriceRefresh } from '@/store/usePriceRefresh';
import { convex } from '@/sync/convexClient';
import { SyncController } from '@/sync/useSync';
import { SyncBanner } from '@/components/sync/SyncBanner';
import { BottomNav } from './BottomNav';
import { FrozenMonthBanner } from './FrozenMonthBanner';
import { Logo } from './Logo';
import { NotificationsButton, ThemeToggleButton } from './PageHeader';
import { MoreSheet, QuickAddSheet } from './Sheets';
import { Sidebar } from './Sidebar';
import { UpdateBanner } from './UpdateBanner';

export function AppShell() {
  useMonthClose();
  usePriceRefresh();
  useBankSync();
  return (
    <div className="min-h-screen lg:flex">
      {convex && <SyncController />}
      <Sidebar className="hidden lg:flex" />
      <div className="min-w-0 flex-1 overflow-x-clip">
        {/* Phone top bar: two glass islands that stay put while the page scrolls under a fade, like a Liquid Glass toolbar. */}
        <header className="pointer-events-none sticky top-0 z-30 lg:hidden">
          <div aria-hidden className="absolute inset-x-0 -bottom-6 top-0 -z-10 bg-linear-to-b from-page via-page/70 to-transparent" />
          <div className="pointer-events-auto flex items-center justify-between px-4 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:px-6">
            <div id="topbar-slot" className="peer contents" />
            <Logo className="glass press h-11 rounded-full pl-1.5 pr-3.5 peer-[:not(:empty)]:hidden" />
            <div className="glass flex h-11 items-center gap-0.5 rounded-full p-1">
              <LanguageSwitch variant="compact" className="" />
              <ThemeToggleButton className="press" />
              <NotificationsButton className="press" />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-4 pb-28 pt-4 sm:px-6 lg:px-6 lg:pb-10 lg:pt-6">
          <UpdateBanner className="mb-4" />
          <SyncBanner className="mb-4" />
          <FrozenMonthBanner className="mb-4" />
          <Outlet />
        </main>
      </div>
      <BottomNav className="lg:hidden" />
      <MoreSheet />
      <QuickAddSheet />
    </div>
  );
}
