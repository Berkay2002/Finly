import { Outlet } from 'react-router-dom';
import { useMonthClose } from '@/store/useMonthClose';
import { convex } from '@/sync/convexClient';
import { SyncController } from '@/sync/useSync';
import { SyncBanner } from '@/components/sync/SyncBanner';
import { BottomNav } from './BottomNav';
import { FrozenMonthBanner } from './FrozenMonthBanner';
import { Logo } from './Logo';
import { NotificationsButton } from './PageHeader';
import { MoreSheet, QuickAddSheet } from './Sheets';
import { Sidebar } from './Sidebar';

export function AppShell() {
  useMonthClose();
  return (
    <div className="min-h-screen lg:flex">
      {convex && <SyncController />}
      <Sidebar className="hidden lg:flex" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between px-4 pt-4 sm:px-6 lg:hidden">
          <Logo />
          <NotificationsButton />
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
