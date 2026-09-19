import { Children, type ReactNode, useState } from 'react';
import clsx from 'clsx';

/**
 * The row of headline figures at the top of a page. A grid from tablet up; on a phone a swipeable
 * row with page dots, like a native carousel, so the page's real content starts one thumb away.
 */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  const count = Children.count(children);
  const [page, setPage] = useState(0);
  return (
    <div className={clsx('mb-5', className)}>
      <div
        onScroll={(e) => {
          const el = e.currentTarget;
          const first = el.firstElementChild as HTMLElement | null;
          if (first) setPage(Math.round(el.scrollLeft / (first.offsetWidth + 12)));
        }}
        className={clsx(
          'grid grid-cols-2 gap-3 xl:grid-cols-4',
          'max-sm:-mx-4 max-sm:flex max-sm:snap-x max-sm:snap-mandatory max-sm:overflow-x-auto max-sm:scroll-px-4 max-sm:px-4 max-sm:scrollbar-none',
          'max-sm:[&>*]:w-[78%] max-sm:[&>*]:shrink-0 max-sm:[&>*]:snap-start max-sm:[&>*]:flex-row max-sm:[&>*]:items-center',
        )}
      >
        {children}
      </div>
      {count > 1 && (
        <div aria-hidden className="mt-2.5 flex justify-center gap-1.5 sm:hidden">
          {Array.from({ length: count }, (_, i) => (
            <span
              key={i}
              className={clsx('h-1.5 rounded-full transition-[width,background-color] duration-200', i === page ? 'w-4 bg-ink/60' : 'w-1.5 bg-ink/20')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
