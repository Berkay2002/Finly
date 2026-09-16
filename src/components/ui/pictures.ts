/**
 * Custom illustrated icons, served from /public/icons/<name>.png (256 px, transparent).
 * The names mirror docs/icon-prompts.md so the brief and the app stay in sync.
 */
export const PICTURES = [
  'logo-mark',
  'welcome-plan',
  'welcome-explore',
  'nav-home',
  'nav-income',
  'nav-home-bills',
  'nav-living',
  'nav-transport',
  'nav-finance',
  'nav-leisure',
  'nav-planned',
  'nav-savings',
  'nav-accounts',
  'nav-planning',
  'nav-insights',
  'nav-settings',
  'stat-safe-to-spend',
  'stat-income',
  'stat-cost',
  'stat-saving',
  'stat-bank',
  'account-everyday',
  'account-salary',
  'account-savings',
  'account-emergency',
  'account-joint',
  'account-cash',
  'account-investment',
  'account-other',
  'goal-shield',
  'goal-home',
  'goal-palmtree',
  'goal-car',
  'goal-laptop',
  'goal-plane',
  'goal-gift',
  'goal-heart',
  'goal-graduation',
  'goal-wrench',
  'goal-piggy',
  'goal-trending',
  'goal-target',
  'goal-leaf',
  'card-where-money-goes',
  'card-position',
  'card-goals',
  'card-income-stability',
  'card-upcoming',
  'card-income-stopped',
  'card-resilience',
  'card-afford',
  'card-income-change',
  'card-per-day',
  'card-expensive-months',
  'card-subscriptions',
  'card-car-cost',
  'card-largest',
  'card-savings-projection',
  'card-allocation',
  'state-empty',
  'state-success',
  'state-warning',
  'state-tip',
  'state-celebrate',
] as const;

export type PictureName = (typeof PICTURES)[number];

const PICTURE_SET: ReadonlySet<string> = new Set(PICTURES);

export function isPicture(value: unknown): value is PictureName {
  return typeof value === 'string' && PICTURE_SET.has(value);
}

export function pictureSrc(name: PictureName): string {
  return `${import.meta.env.BASE_URL}icons/${name}.png`;
}
