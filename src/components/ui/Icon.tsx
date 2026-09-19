import type { LucideIcon } from "lucide-react";
import clsx from "clsx";
import { useSyncExternalStore } from "react";
import { GLYPH } from "./glyphs";
import { isPicture, pictureSrc, type PictureName } from "./pictures";

/** Either a lucide line icon (UI chrome) or one of the custom illustrated PNGs. */
export type IconSource = LucideIcon | PictureName;

/**
 * Renders an IconSource at a given pixel size. Pictures are drawn as <img>, line icons as SVG.
 * Illustrations carry their own colour, so `className` colour utilities only affect line icons.
 */
export function Icon({
  icon,
  size = 18,
  strokeWidth = 2,
  className,
  pictureScale = 1,
}: {
  icon: IconSource;
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Pictures have built-in padding; >1 lets them fill the same optical footprint as a glyph. */
  pictureScale?: number;
}) {
  const phone = useIsPhone();
  if (isPicture(icon) && phone && GLYPH[icon]) {
    const Twin = GLYPH[icon];
    // Illustrations are drawn big; a line icon that size wants a lighter stroke.
    return (
      <Twin
        size={size}
        strokeWidth={size >= 28 ? 1.5 : strokeWidth}
        className={clsx("shrink-0", className)}
      />
    );
  }
  if (isPicture(icon)) {
    const px = Math.round(size * pictureScale);
    return (
      <img
        src={pictureSrc(icon)}
        alt=""
        width={px}
        height={px}
        draggable={false}
        decoding="async"
        className={clsx("shrink-0 select-none object-contain", className)}
        style={{ width: px, height: px }}
      />
    );
  }
  const Glyph = icon;
  return <Glyph size={size} strokeWidth={strokeWidth} className={className} />;
}

const PHONE = "(max-width: 639px)";
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(PHONE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
/** Below Tailwind's `sm` breakpoint, where the illustrated set gives way to line icons. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE).matches,
    () => false,
  );
}
