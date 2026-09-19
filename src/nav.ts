import type { ExpenseCategory } from '@/engine/types';
import type { IconSource } from '@/components/ui/Icon';
import { useBankStore } from '@/bank/bankStore';
import { messages, type Messages } from '@/i18n';

export interface NavItem {
  to: string;
  /** In the current language. */
  readonly label: string;
  icon: IconSource;
  category?: ExpenseCategory;
}

const item = (to: string, key: keyof Messages['nav'], icon: IconSource, category?: ExpenseCategory): NavItem => ({
  to,
  icon,
  ...(category ? { category } : {}),
  get label() {
    return messages().nav[key];
  },
});

export const NAV_ITEMS: NavItem[] = [
  item('/', 'home', 'nav-home'),
  item('/income', 'income', 'nav-income'),
  item('/home', 'homeBills', 'nav-home-bills', 'home'),
  item('/living', 'living', 'nav-living', 'living'),
  item('/transport', 'transport', 'nav-transport', 'transport'),
  item('/finance', 'finance', 'nav-finance', 'finance'),
  item('/leisure', 'leisure', 'nav-leisure', 'leisure'),
  item('/planned', 'planned', 'nav-planned', 'planned'),
  item('/savings', 'savings', 'nav-savings'),
  item('/accounts', 'accounts', 'nav-accounts'),
  item('/loans', 'loans', 'stat-bank'),
  item('/bank', 'bank', 'card-upcoming'),
  item('/planning', 'planning', 'nav-planning'),
  item('/insights', 'insights', 'nav-insights'),
];

/** The nav for this device: bank payments only once a bank has given lines. */
export function useNavItems(): NavItem[] {
  const hasBank = useBankStore((s) => Object.values(s.txs).some((list) => list.length));
  return hasBank ? NAV_ITEMS : NAV_ITEMS.filter((i) => i.to !== '/bank');
}

export const SETTINGS_ITEM: NavItem = item('/settings', 'settings', 'nav-settings');

export const CATEGORY_ROUTE: Record<ExpenseCategory, string> = {
  home: '/home',
  living: '/living',
  transport: '/transport',
  finance: '/finance',
  leisure: '/leisure',
  planned: '/planned',
};
