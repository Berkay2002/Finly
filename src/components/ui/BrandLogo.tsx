import clsx from 'clsx';
import { logoUrlForDomain, logoUrlForName, logoUrlForSecurity } from '@/lib/brandLogo';

const SIZES = {
  xs: 'h-6 w-6 rounded-md p-0.5',
  sm: 'h-9 w-9 rounded-lg p-1',
  md: 'h-11 w-11 rounded-xl p-1.5',
  lg: 'h-14 w-14 rounded-2xl p-2',
} as const;

/** Square logos arrive square; the image itself is clipped round so every logo reads the same. */
const ROUND = {
  xs: 'rounded-[4px]',
  sm: 'rounded-md',
  md: 'rounded-lg',
  lg: 'rounded-xl',
} as const;

/**
 * A company logo by brand domain, a listed company's ISIN or ticker, or name, in the same footprint as an
 * icon tile, in that order of preference. Renders nothing without a key; `frame={false}` drops the tile chrome for use
 * inside chips that are already framed.
 */
export function BrandLogo({
  name,
  domain,
  isin,
  ticker,
  size = 'sm',
  frame = true,
  className,
}: {
  name?: string;
  domain?: string;
  isin?: string;
  ticker?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  frame?: boolean;
  className?: string;
}) {
  const url = domain
    ? logoUrlForDomain(domain)
    : isin || ticker
      ? logoUrlForSecurity({ isin, ticker })
      : name
        ? logoUrlForName(name)
        : undefined;
  if (!url) return null;
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center justify-center overflow-hidden',
        frame && 'border border-line bg-card',
        SIZES[size],
        className,
      )}
    >
      <img src={url} alt="" aria-hidden loading="lazy" decoding="async" className={clsx('h-full w-full object-contain', ROUND[size])} />
    </span>
  );
}
