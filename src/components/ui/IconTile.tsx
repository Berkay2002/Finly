import clsx from 'clsx';
import { ACCENT, type Accent } from './accent';
import { Icon, type IconSource } from './Icon';
import { isPicture } from './pictures';

const SIZES = {
  sm: { tile: 'h-9 w-9 rounded-lg', glyph: 16, picture: 36 },
  md: { tile: 'h-11 w-11 rounded-xl', glyph: 18, picture: 44 },
  lg: { tile: 'h-14 w-14 rounded-2xl', glyph: 22, picture: 56 },
} as const;

/**
 * Line icons sit on a soft tinted tile. Illustrated pictures carry their own colour and depth,
 * so they are drawn bare in the same footprint, with no background behind them.
 */
export function IconTile({
  icon,
  accent = 'brand',
  size = 'md',
  className,
}: {
  icon: IconSource;
  accent?: Accent;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const s = SIZES[size];
  const picture = isPicture(icon);
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center justify-center',
        s.tile,
        picture ? 'bg-transparent' : ACCENT[accent].tile,
        className,
      )}
    >
      <Icon icon={icon} size={picture ? s.picture : s.glyph} strokeWidth={2} />
    </span>
  );
}
