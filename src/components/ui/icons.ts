import type { ExpenseCategory, GoalKind, OnboardingStep } from '@/engine/types';
import type { AccountKind } from '@/engine/types';
import type { Accent } from './accent';
import type { IconSource } from './Icon';
import type { PictureName } from './pictures';

export const CATEGORY_ICON: Record<ExpenseCategory, IconSource> = {
  home: 'nav-home-bills',
  living: 'nav-living',
  transport: 'nav-transport',
  finance: 'nav-finance',
  leisure: 'nav-leisure',
  planned: 'nav-planned',
};

export const STEP_ICON: Record<OnboardingStep, IconSource> = {
  income: 'nav-income',
  home: 'nav-home-bills',
  living: 'nav-living',
  transport: 'nav-transport',
  finance: 'nav-finance',
  leisure: 'nav-leisure',
  planned: 'nav-planned',
  savings: 'nav-savings',
  accounts: 'nav-accounts',
  summary: 'state-celebrate',
};

export const ACCOUNT_ICON: Record<AccountKind, IconSource> = {
  everyday: 'account-everyday',
  salary: 'account-salary',
  savings: 'account-savings',
  emergency: 'account-emergency',
  joint: 'account-joint',
  cash: 'account-cash',
  isk: 'account-investment',
  kf: 'account-investment',
  af: 'account-investment',
  investment: 'account-investment',
  other: 'account-other',
};

export const ACCOUNT_ACCENT: Record<AccountKind, Accent> = {
  everyday: 'blue',
  salary: 'green',
  savings: 'purple',
  emergency: 'yellow',
  joint: 'red',
  cash: 'orange',
  isk: 'green',
  kf: 'brand',
  af: 'blue',
  investment: 'green',
  other: 'indigo',
};

export const GOAL_KIND_ICON: Record<GoalKind, IconSource> = {
  emergency: 'goal-shield',
  general: 'goal-piggy',
  investment: 'goal-trending',
  purchase: 'goal-target',
  pension: 'goal-leaf',
  custom: 'goal-target',
};

/** Icons a user can pick for a goal. Keys are stored on the goal, so keep them stable. */
export const GOAL_ICONS: Record<string, PictureName> = {
  shield: 'goal-shield',
  home: 'goal-home',
  palmtree: 'goal-palmtree',
  car: 'goal-car',
  laptop: 'goal-laptop',
  plane: 'goal-plane',
  gift: 'goal-gift',
  heart: 'goal-heart',
  graduation: 'goal-graduation',
  wrench: 'goal-wrench',
  piggy: 'goal-piggy',
  trending: 'goal-trending',
  target: 'goal-target',
  leaf: 'goal-leaf',
};

export const GOAL_ICON_ACCENT: Record<string, Accent> = {
  shield: 'green',
  home: 'red',
  palmtree: 'blue',
  car: 'red',
  laptop: 'purple',
  plane: 'blue',
  gift: 'orange',
  heart: 'red',
  graduation: 'indigo',
  wrench: 'orange',
  piggy: 'purple',
  trending: 'green',
  target: 'yellow',
  leaf: 'brand',
};

export const NAV_ICON = {
  home: 'nav-home',
  income: 'nav-income',
  savings: 'nav-savings',
  accounts: 'nav-accounts',
  planning: 'nav-planning',
  insights: 'nav-insights',
  settings: 'nav-settings',
} as const satisfies Record<string, PictureName>;

export function goalIcon(name?: string, kind?: GoalKind): IconSource {
  if (name && GOAL_ICONS[name]) return GOAL_ICONS[name];
  return kind ? GOAL_KIND_ICON[kind] : 'goal-target';
}

export function goalAccent(name?: string, kind?: GoalKind): Accent {
  if (name && GOAL_ICON_ACCENT[name]) return GOAL_ICON_ACCENT[name];
  switch (kind) {
    case 'emergency':
      return 'green';
    case 'investment':
      return 'green';
    case 'pension':
      return 'brand';
    case 'general':
      return 'purple';
    default:
      return 'blue';
  }
}
