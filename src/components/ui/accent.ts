export type Accent =
  | 'brand'
  | 'blue'
  | 'green'
  | 'orange'
  | 'yellow'
  | 'purple'
  | 'lavender'
  | 'red'
  | 'indigo'
  | 'neutral';

export interface AccentStyle {
  tile: string;
  text: string;
  bar: string;
  soft: string;
  /** CSS colour for SVG fill/stroke; a token var so it follows the theme. */
  color: string;
  dot: string;
}

/** Full class strings so Tailwind's scanner picks them up. */
export const ACCENT: Record<Accent, AccentStyle> = {
  brand: {
    tile: 'bg-brand-50 text-brand-600',
    text: 'text-brand-600',
    bar: 'bg-brand-500',
    soft: 'bg-brand-50',
    color: 'var(--color-brand-500)',
    dot: 'bg-brand-500',
  },
  blue: {
    tile: 'bg-blue-100 text-blue-500',
    text: 'text-blue-500',
    bar: 'bg-blue-500',
    soft: 'bg-blue-100',
    color: 'var(--color-blue-500)',
    dot: 'bg-blue-500',
  },
  green: {
    tile: 'bg-green-100 text-green-500',
    text: 'text-green-500',
    bar: 'bg-green-500',
    soft: 'bg-green-100',
    color: 'var(--color-green-500)',
    dot: 'bg-green-500',
  },
  orange: {
    tile: 'bg-orange-100 text-orange-500',
    text: 'text-orange-500',
    bar: 'bg-orange-500',
    soft: 'bg-orange-100',
    color: 'var(--color-orange-500)',
    dot: 'bg-orange-500',
  },
  yellow: {
    tile: 'bg-yellow-100 text-yellow-500',
    text: 'text-yellow-500',
    bar: 'bg-yellow-500',
    soft: 'bg-yellow-100',
    color: 'var(--color-yellow-500)',
    dot: 'bg-yellow-500',
  },
  purple: {
    tile: 'bg-purple-100 text-purple-500',
    text: 'text-purple-500',
    bar: 'bg-purple-500',
    soft: 'bg-purple-100',
    color: 'var(--color-purple-500)',
    dot: 'bg-purple-500',
  },
  lavender: {
    tile: 'bg-lavender-100 text-lavender-500',
    text: 'text-lavender-500',
    bar: 'bg-lavender-500',
    soft: 'bg-lavender-100',
    color: 'var(--color-lavender-500)',
    dot: 'bg-lavender-500',
  },
  red: {
    tile: 'bg-red-100 text-red-500',
    text: 'text-red-500',
    bar: 'bg-red-500',
    soft: 'bg-red-100',
    color: 'var(--color-red-500)',
    dot: 'bg-red-500',
  },
  indigo: {
    tile: 'bg-indigo-100 text-indigo-500',
    text: 'text-indigo-500',
    bar: 'bg-indigo-500',
    soft: 'bg-indigo-100',
    color: 'var(--color-indigo-500)',
    dot: 'bg-indigo-500',
  },
  neutral: {
    tile: 'bg-page text-muted',
    text: 'text-muted',
    bar: 'bg-faint',
    soft: 'bg-page',
    color: 'var(--color-faint)',
    dot: 'bg-faint',
  },
};

export const ACCENT_CYCLE: Accent[] = ['blue', 'green', 'orange', 'yellow', 'purple', 'lavender', 'red', 'indigo'];

export function accentAt(i: number): Accent {
  return ACCENT_CYCLE[i % ACCENT_CYCLE.length];
}
