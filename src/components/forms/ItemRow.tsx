import { ChevronRight, Pencil } from 'lucide-react';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { Accent } from '@/components/ui/accent';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { IconTile } from '@/components/ui/IconTile';
import type { IconSource } from '@/components/ui/Icon';
import { KebabMenu, type MenuItem } from '@/components/ui/Menu';
import { useT } from '@/i18n';
import { logoDevEnabled } from '@/lib/brandLogo';

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
  opens = false,
  inline = false,
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
  /** `onClick` goes to a page of its own rather than opening the editor: a chevron instead of the pencil. */
  opens?: boolean;
  /** A single value or field: keep it beside the title on a phone instead of on a row of its own. */
  inline?: boolean;
}) {
  const t = useT();
  return (
    <div
      className={clsx(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-card px-3.5 py-3 transition-colors',
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
        title={onClick && !opens ? t.expenses.row.editDetails : undefined}
        className={clsx(
          'group/edit order-1 -my-1 -ml-1.5 flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 pl-1.5 pr-2 text-left',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200',
          onClick ? 'cursor-pointer' : 'cursor-default',
        )}
      >
        {(brand || brandDomain) && logoDevEnabled() ? (
          <>
            <BrandLogo name={brand ?? undefined} domain={brandDomain} size="lg" className="sm:hidden" />
            <BrandLogo name={brand ?? undefined} domain={brandDomain} size="md" className="max-sm:hidden" />
          </>
        ) : (
          <>
            <IconTile icon={icon} accent={accent} size="lg" className="sm:hidden" />
            <IconTile icon={icon} accent={accent} size="md" className="max-sm:hidden" />
          </>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold text-ink transition-colors group-hover/edit:text-brand-700">
              {title}
            </span>
            {onClick && opens && <ChevronRight size={14} aria-hidden className="shrink-0 text-muted group-hover/edit:text-brand-600" />}
            {onClick && !opens && (
              <Pencil
                size={12}
                aria-hidden
                className="shrink-0 text-brand-600 opacity-0 transition-opacity group-hover/edit:opacity-100 group-focus-visible/edit:opacity-100"
              />
            )}
          </div>
          {meta && <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-muted">{meta}</div>}
        </div>
      </button>
      {menu && <KebabMenu items={menu} className={clsx('-mr-1', inline ? 'order-3' : 'order-2 sm:order-3')} />}
      {fields && <div className={clsx('flex items-center gap-2', inline ? 'order-2 w-auto' : 'order-3 w-full sm:order-2 sm:w-auto')}>{fields}</div>}
    </div>
  );
}
