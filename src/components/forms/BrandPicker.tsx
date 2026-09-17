import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useT } from '@/i18n';
import { logoDevEnabled } from '@/lib/brandLogo';
import { searchBrands, type BrandResult } from '@/lib/logoSearch';
import { Label } from '@/components/ui/fields';
import { BrandLogo } from '@/components/ui/BrandLogo';

/**
 * Logo feedback and picking for a subscription's name, shown under the Name field. While the brand
 * search endpoint answers, it lists the companies found so the right one can be picked (tap again to
 * go back to the best guess). Without it, a quiet preview of what the name resolves to. Picking
 * stores the brand's domain, which pins the logo even if the name changes later.
 */
export function BrandPicker({ name, domain, onPick }: { name: string; domain?: string; onPick: (domain: string | undefined) => void }) {
  const t = useT();
  const tf = t.expenses.form;
  const [results, setResults] = useState<BrandResult[] | null>(null);
  const query = name.trim();

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(async () => {
      const found = await searchBrands(query);
      if (alive) setResults(found);
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  if (!logoDevEnabled() || query.length < 2) return null;

  // A picked domain stays visible even while the search for a renamed entry has not come back yet.
  const chips: BrandResult[] =
    domain && !results?.some((c) => c.domain === domain) ? [{ name: domain, domain }, ...(results ?? [])] : (results ?? []);

  return (
    <div className="space-y-1.5">
      <Label hint={tf.brandLogoHint}>{tf.brandLogo}</Label>
      {results === null ? (
        <p className="flex items-center gap-2 text-[12.5px] text-muted">
          <BrandLogo name={query} domain={domain} size="xs" />
          {domain ?? tf.brandGuess}
        </p>
      ) : chips.length === 0 ? (
        <p className="flex items-center gap-2 text-[12.5px] text-muted">
          <BrandLogo name={query} size="xs" />
          {tf.brandNone(query)}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button
                key={c.domain}
                type="button"
                onClick={() => onPick(c.domain === domain ? undefined : c.domain)}
                className={clsx(
                  'flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[12px] font-medium transition',
                  c.domain === domain
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-line bg-card text-ink-soft hover:border-line-strong hover:text-ink',
                )}
              >
                <BrandLogo name={c.name} domain={c.domain} size="xs" frame={false} />
                {c.domain}
              </button>
            ))}
          </div>
          <p className="text-[11.5px] text-faint">{tf.brandPick}</p>
        </>
      )}
    </div>
  );
}
