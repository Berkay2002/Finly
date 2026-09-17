import { allMessages } from '@/i18n';
import { suggestionBySlug } from '@/engine/taxonomy';

/**
 * Company logos via Logo.dev's image CDN, looked up by the brand domain picked from search or,
 * before one is picked, by name. The publishable key only unlocks logo images and is safe in
 * client-side URLs; without it the app never shows brand logos.
 */
const ENDPOINT = 'https://img.logo.dev';

export function logoDevEnabled(): boolean {
  return Boolean(import.meta.env.VITE_LOGO_DEV_PUBLISHABLE_KEY);
}

export function logoUrlForDomain(domain: string, size = 128): string | undefined {
  const key = import.meta.env.VITE_LOGO_DEV_PUBLISHABLE_KEY;
  const clean = domain.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!key || !clean) return undefined;
  const params = new URLSearchParams({ token: key, format: 'png', size: String(size) });
  return `${ENDPOINT}/${encodeURIComponent(clean)}?${params.toString()}`;
}

/** A listed company's logo by ISIN, or by ticker without one. Exact, unlike a name lookup. */
export function logoUrlForSecurity(security: { isin?: string; ticker?: string }, size = 128): string | undefined {
  const key = import.meta.env.VITE_LOGO_DEV_PUBLISHABLE_KEY;
  const path = security.isin ? `isin/${security.isin}` : security.ticker ? `ticker/${security.ticker}` : undefined;
  if (!key || !path) return undefined;
  const params = new URLSearchParams({ token: key, format: 'png', size: String(size) });
  return `${ENDPOINT}/${path}?${params.toString()}`;
}

export function logoUrlForName(name: string, size = 128): string | undefined {
  const key = import.meta.env.VITE_LOGO_DEV_PUBLISHABLE_KEY;
  const clean = name.trim();
  if (!key || !clean) return undefined;
  const params = new URLSearchParams({ token: key, format: 'png', size: String(size) });
  return `${ENDPOINT}/name/${encodeURIComponent(clean)}?${params.toString()}`;
}

/**
 * Domains of the banks and brokers most Swedes hold accounts with. A name lookup guesses and can land
 * on the wrong company ("SEB"), a known domain cannot.
 */
const BANK_DOMAINS: Record<string, string> = {
  swedbank: 'swedbank.se',
  seb: 'seb.se',
  handelsbanken: 'handelsbanken.se',
  nordea: 'nordea.se',
  // avanza.se resolves to a dark wordmark that vanishes in dark mode; .com is the square app icon.
  avanza: 'avanza.com',
  nordnet: 'nordnet.se',
  lansforsakringar: 'lansforsakringar.se',
  'danske bank': 'danskebank.se',
  'ica banken': 'icabanken.se',
  skandia: 'skandia.se',
  sbab: 'sbab.se',
  'ikano bank': 'ikanobank.se',
  'marginalen bank': 'marginalen.se',
  'resurs bank': 'resursbank.se',
  collector: 'collector.se',
  lysa: 'lysa.se',
  klarna: 'klarna.com',
  revolut: 'revolut.com',
  lunar: 'lunar.app',
  csn: 'csn.se',
};

/** The domain of a known bank typed as "Länsförsäkringar", "avanza bank" or "SEB AB"; undefined otherwise. */
export function bankDomain(institution: string | undefined): string | undefined {
  const clean = (institution ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const key = Object.keys(BANK_DOMAINS).find((k) => clean === k || clean.startsWith(`${k} `));
  return key && BANK_DOMAINS[key];
}

/**
 * The brand name to look up a logo for, or null when the item has no brand of its own:
 * a suggested item still carrying its default name ("Streaming services", in any language)
 * would only resolve to an arbitrary company.
 */
export function brandedExpenseName(e: { name: string; subcategory: string }): string | null {
  const name = e.name.trim();
  if (!name) return null;
  const suggestion = suggestionBySlug(e.subcategory);
  if (!suggestion) return name;
  const defaults = allMessages().map((m) => (m.taxonomy.expenses as Record<string, string>)[e.subcategory]);
  return defaults.includes(name) ? null : name;
}
