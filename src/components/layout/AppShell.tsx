import { Outlet } from 'react-router-dom';
import { LanguageSwitch } from '@/components/ui/LanguageSwitch';
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

export function AppShell() {
  useMonthClose();
  usePriceRefresh();
  return (
    <div className="min-h-screen lg:flex">
      {convex && <SyncController />}
      <Sidebar className="hidden lg:flex" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between px-4 pt-4 sm:px-6 lg:hidden">
          <Logo />
          <div className="flex items-center gap-2">
            <LanguageSwitch variant="compact" />
            <ThemeToggleButton />
            <NotificationsButton />
          </div>
        </div>
        <main className="mx-auto w-full max-w-[1440px] px-4 pb-28 pt-4 sm:px-6 lg:px-6 lg:pb-10 lg:pt-6">
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
