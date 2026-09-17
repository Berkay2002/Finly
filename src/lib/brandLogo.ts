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

export function logoUrlForName(name: string, size = 128): string | undefined {
  const key = import.meta.env.VITE_LOGO_DEV_PUBLISHABLE_KEY;
  const clean = name.trim();
  if (!key || !clean) return undefined;
  const params = new URLSearchParams({ token: key, format: 'png', size: String(size) });
  return `${ENDPOINT}/name/${encodeURIComponent(clean)}?${params.toString()}`;
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
