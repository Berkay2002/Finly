import { Fragment, useEffect, type ReactNode } from 'react';
import { useLanguage } from '.';

/**
 * Remounts the app when the language changes. Much of the text is read from the dictionary during
 * render (taxonomy labels, formatted dates) by components that do not subscribe to the language, so a
 * fresh tree is the simple way to have all of it follow. Plan and UI state live in stores and survive.
 */
export function LanguageRoot({ children }: { children: ReactNode }) {
  const language = useLanguage();
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return <Fragment key={language}>{children}</Fragment>;
}
