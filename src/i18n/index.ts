import type { Locale } from 'date-fns';
import { enGB } from 'date-fns/locale/en-GB';
import { sv as svDateLocale } from 'date-fns/locale/sv';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import en, { type Messages } from './en';
import sv from './sv';

export type { Messages } from './en';
export { plural } from './plural';

export type Language = 'en' | 'sv';

export const LANGUAGES: { id: Language; label: string; short: string }[] = [
  { id: 'en', label: 'English', short: 'EN' },
  { id: 'sv', label: 'Svenska', short: 'SV' },
];

const MESSAGES: Record<Language, Messages> = { en, sv };
const LOCALES: Record<Language, string> = { en: 'en-GB', sv: 'sv-SE' };
const DATE_LOCALES: Record<Language, Locale> = { en: enGB, sv: svDateLocale };

/** Swedish when the browser prefers it, else English. Tests and other non-browser code get English. */
function detectLanguage(): Language {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'en';
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
  return preferred.some((l) => l?.toLowerCase().startsWith('sv')) ? 'sv' : 'en';
}

interface LanguageState {
  language: Language;
  /** Whether the person picked it, rather than it being guessed from the browser. */
  chosen: boolean;
  setLanguage: (language: Language) => void;
}

/** The language is a device preference, like a theme: it is not part of the plan and does not sync. */
export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: detectLanguage(),
      chosen: false,
      setLanguage: (language) => set({ language, chosen: true }),
    }),
    { name: 'finly-language' },
  ),
);

export function getLanguage(): Language {
  return useLanguageStore.getState().language;
}

export function setLanguage(language: Language): void {
  useLanguageStore.getState().setLanguage(language);
}

/** The dictionary for the current language, read at call time. Use in engine code and event handlers. */
export function messages(): Messages {
  return MESSAGES[getLanguage()];
}

/** Every language's dictionary, for recognising a default name saved in another language. */
export function allMessages(): Messages[] {
  return Object.values(MESSAGES);
}

/** The dictionary for the current language; re-renders when it changes. */
export function useT(): Messages {
  return MESSAGES[useLanguageStore((s) => s.language)];
}

export function useLanguage(): Language {
  return useLanguageStore((s) => s.language);
}

/** BCP 47 tag for Intl: en-GB or sv-SE. */
export function locale(): string {
  return LOCALES[getLanguage()];
}

/** Locale for date-fns `format` and `formatDistanceToNow`. */
export function dateLocale(): Locale {
  return DATE_LOCALES[getLanguage()];
}
