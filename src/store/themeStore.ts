import { useEffect, useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** Browser chrome colour per theme; matches --color-page. index.html sets the same before first paint. */
const THEME_COLOR: Record<ResolvedTheme, string> = { light: '#f5f7fa', dark: '#121214' };

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

/** The theme is a device preference, like the language: it is not part of the plan and does not sync. */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'system',
      setMode: (mode) => set({ mode }),
    }),
    // index.html reads this key directly to avoid a light flash; keep the two in step.
    { name: 'finly.theme' },
  ),
);

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribeSystem(onChange: () => void) {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function systemPrefersDark() {
  return window.matchMedia(DARK_QUERY).matches;
}

/** The theme actually shown: the chosen mode, with System following the OS live. */
export function useResolvedTheme(): ResolvedTheme {
  const mode = useThemeStore((s) => s.mode);
  const systemDark = useSyncExternalStore(subscribeSystem, systemPrefersDark, () => false);
  if (mode === 'system') return systemDark ? 'dark' : 'light';
  return mode;
}

/** Applies the resolved theme to <html> and the theme-color meta. Mount once. */
export function ThemeController() {
  const theme = useResolvedTheme();
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  }, [theme]);
  return null;
}
