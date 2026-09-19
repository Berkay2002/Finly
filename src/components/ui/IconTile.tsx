import clsx from "clsx";
import { ACCENT, type Accent } from "./accent";
import { GLYPH } from "./glyphs";
import { Icon, type IconSource, useIsPhone } from "./Icon";
import { isPicture } from "./pictures";

const SIZES = {
  sm: { tile: "h-9 w-9 rounded-lg", glyph: 16, picture: 36 },
  md: { tile: "h-11 w-11 rounded-xl", glyph: 18, picture: 44 },
  lg: { tile: "h-14 w-14 rounded-2xl", glyph: 22, picture: 56 },
} as const;

/** On a phone every icon is a bare line icon in the current colour, no tile: the box only sets its footprint. */
const PHONE = {
  sm: { tile: "h-8 w-8", glyph: 20 },
  md: { tile: "h-9 w-9", glyph: 22 },
  lg: { tile: "h-11 w-11", glyph: 28 },
} as const;

/**
 * Line icons sit on a soft tinted tile. Illustrated pictures carry their own colour and depth,
 * so they are drawn bare in the same footprint, with no background behind them.
 */
export function IconTile({
  icon,
  accent = "brand",
  size = "md",
  className,
}: {
  icon: IconSource;
  accent?: Accent;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const s = SIZES[size];
  const picture = isPicture(icon);
  const bare = useIsPhone() && (!picture || !!GLYPH[icon]);
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center justify-center",
        bare ? PHONE[size].tile : s.tile,
        bare ? "bg-transparent text-ink" : picture ? "bg-transparent" : ACCENT[accent].tile,
        className,
      )}
    >
      <Icon
        icon={icon}
        size={bare ? PHONE[size].glyph : picture ? s.picture : s.glyph}
        strokeWidth={bare ? 1.6 : 2}
      />
    </span>
  );
}
