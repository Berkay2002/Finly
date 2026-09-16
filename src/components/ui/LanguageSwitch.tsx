import clsx from 'clsx';
import { LANGUAGES, useLanguageStore, type Language } from '@/i18n';
import { SegmentedControl } from './fields';

const svg = (markup: string) => `data:image/svg+xml,${encodeURIComponent(markup)}`;

/**
 * Flags drawn as SVG: Windows has no flag emoji, so "🇸🇪" would render as the letters "SE". If an image
 * still fails to load, its alt text shows the language code instead.
 */
const FLAGS: Record<Language, string> = {
  en: svg(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30"><clipPath id="s"><path d="M0,0v30h60V0z"/></clipPath>' +
      '<clipPath id="t"><path d="M30,15h30v15zv15H0zH0V0zV0h30z"/></clipPath><g clip-path="url(#s)">' +
      '<path d="M0,0v30h60V0z" fill="#012169"/><path d="M0,0 60,30M60,0 0,30" stroke="#fff" stroke-width="6"/>' +
      '<path d="M0,0 60,30M60,0 0,30" clip-path="url(#t)" stroke="#C8102E" stroke-width="4"/>' +
      '<path d="M30,0v30M0,15h60" stroke="#fff" stroke-width="10"/><path d="M30,0v30M0,15h60" stroke="#C8102E" stroke-width="6"/></g></svg>',
  ),
  sv: svg(
    // Square with the cross centred: the real 16:10 flag's offset cross looks misplaced once cropped to a circle.
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="#006AA7" d="M0 0h10v10H0z"/>' +
      '<path fill="#FECC00" d="M4 0h2v10H4zM0 4h10v2H0z"/></svg>',
  ),
};

/**
 * Picks the app language. `full` shows the language names as a segmented control (onboarding,
 * Settings); `compact` is a pair of flags for the header and the welcome screen.
 */
export function LanguageSwitch({ variant = 'full', className }: { variant?: 'full' | 'compact'; className?: string }) {
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);

  if (variant === 'full') {
    return (
      <SegmentedControl
        className={className}
        value={language}
        onChange={setLanguage}
        options={LANGUAGES.map((l) => ({ value: l.id, label: l.label }))}
      />
    );
  }

  return (
    <div
      role="group"
      className={clsx('inline-flex h-9 items-center gap-0.5 rounded-full border border-line bg-card p-1', className)}
    >
      {LANGUAGES.map((l) => (
        <button
          key={l.id}
          type="button"
          lang={l.id}
          title={l.label}
          aria-label={l.label}
          aria-pressed={language === l.id}
          onClick={() => setLanguage(l.id)}
          className={clsx(
            'inline-flex h-7 w-7 items-center justify-center rounded-full transition',
            language === l.id ? 'bg-page ring-1 ring-line-strong' : 'opacity-50 hover:opacity-100',
          )}
        >
          <img
            src={FLAGS[l.id]}
            alt={l.short}
            className="h-[18px] w-[18px] rounded-full object-cover text-[10px] font-semibold leading-[18px] text-ink"
          />
        </button>
      ))}
    </div>
  );
}
