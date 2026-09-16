import type { ExpenseCategory } from '@/engine/types';
import type { IconSource } from '@/components/ui/Icon';

export interface NavItem {
  to: string;
  label: string;
  icon: IconSource;
  category?: ExpenseCategory;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: 'nav-home' },
  { to: '/income', label: 'Income', icon: 'nav-income' },
  { to: '/home', label: 'Home & Bills', icon: 'nav-home-bills', category: 'home' },
  { to: '/living', label: 'Living Costs', icon: 'nav-living', category: 'living' },
  { to: '/transport', label: 'Transport', icon: 'nav-transport', category: 'transport' },
  { to: '/finance', label: 'Finance & Insurance', icon: 'nav-finance', category: 'finance' },
  { to: '/leisure', label: 'Leisure', icon: 'nav-leisure', category: 'leisure' },
  { to: '/planned', label: 'Planned Spending', icon: 'nav-planned', category: 'planned' },
  { to: '/savings', label: 'Savings & Goals', icon: 'nav-savings' },
  { to: '/accounts', label: 'Accounts', icon: 'nav-accounts' },
  { to: '/loans', label: 'Loans', icon: 'stat-bank' },
  { to: '/planning', label: 'Planning Tools', icon: 'nav-planning' },
  { to: '/insights', label: 'Insights', icon: 'nav-insights' },
];

export const SETTINGS_ITEM: NavItem = { to: '/settings', label: 'Settings', icon: 'nav-settings' };

export const CATEGORY_ROUTE: Record<ExpenseCategory, string> = {
  home: '/home',
  living: '/living',
  transport: '/transport',
  finance: '/finance',
  leisure: '/leisure',
  planned: '/planned',
};
