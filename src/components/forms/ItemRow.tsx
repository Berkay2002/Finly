import { Pencil } from 'lucide-react';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { Accent } from '@/components/ui/accent';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { IconTile } from '@/components/ui/IconTile';
import type { IconSource } from '@/components/ui/Icon';
import { KebabMenu, type MenuItem } from '@/components/ui/Menu';
import { useT } from '@/i18n';

/**
 * One editable line item: icon, name/meta on the left, fields in the middle, menu on the right.
 * Wraps on small screens so the money field stays usable.
 */
export function ItemRow({
  icon,
  accent,
  title,
  meta,
  fields,
  menu,
  className,
  onClick,
  brand,
  brandDomain,
}: {
  icon: IconSource;
  accent: Accent;
  title: ReactNode;
  meta?: ReactNode;
  fields?: ReactNode;
  menu?: MenuItem[];
  className?: string;
  onClick?: () => void;
  /** A brand name; when set, the company logo takes the icon tile's place. */
  brand?: string | null;
  /** A picked brand domain; wins over `brand` since it pins the exact company. */
  brandDomain?: string;
}) {
  const t = useT();
  return (
    <div
      className={clsx(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-card px-3 py-2.5 transition-colors',
        // Only the clickable title area drives the row hover, so hovering the balance field or menu stays neutral.
        onClick && 'has-[[data-edit]:hover]:border-line-strong has-[[data-edit]:hover]:bg-page/70',
        className,
      )}
    >
      <button
        type="button"
        onClick={onClick}
        data-edit={onClick ? '' : undefined}
        disabled={!onClick}
        title={onClick ? t.expenses.row.editDetails : undefined}
        className={clsx(
          'group/edit order-1 -my-1 -ml-1.5 flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 pl-1.5 pr-2 text-left',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200',
          onClick ? 'cursor-pointer' : 'cursor-default',
        )}
      >
        {brand || brandDomain ? (
          <BrandLogo name={brand ?? undefined} domain={brandDomain} size="sm" />
        ) : (
          <IconTile icon={icon} accent={accent} size="sm" />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13.5px] font-medium text-ink transition-colors group-hover/edit:text-brand-700">
              {title}
            </span>
            {onClick && (
              <Pencil
                size={12}
                aria-hidden
                className="shrink-0 text-brand-600 opacity-0 transition-opacity group-hover/edit:opacity-100 group-focus-visible/edit:opacity-100"
              />
            )}
          </div>
          {meta && <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">{meta}</div>}
        </div>
      </button>
      {menu && <KebabMenu items={menu} className="order-2 -mr-1 sm:order-3" />}
      {fields && <div className="order-3 flex w-full items-center gap-2 sm:order-2 sm:w-auto">{fields}</div>}
    </div>
  );
}
