import clsx from "clsx";
import { ACCENT, type Accent } from "./accent";
import { Icon, type IconSource, useIsPhone } from "./Icon";
import { isPicture } from "./pictures";

/** Footprint per size. Pictures fill it; line icons are drawn bare a step smaller, never inside a tinted box. */
const SIZES = {
  sm: { tile: "h-9 w-9", glyph: 22, picture: 36 },
  md: { tile: "h-11 w-11", glyph: 26, picture: 44 },
  lg: { tile: "h-14 w-14", glyph: 32, picture: 56 },
} as const;

/**
 * Every icon is drawn bare in its footprint. Illustrated pictures carry their own colour;
 * line icons take the accent colour on desktop and the current ink on a phone.
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
  const phone = useIsPhone();
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center justify-center",
        s.tile,
        phone ? "text-ink" : ACCENT[accent].text,
        className,
      )}
    >
      <Icon icon={icon} size={picture && !phone ? s.picture : s.glyph} strokeWidth={1.6} />
    </span>
  );
}
