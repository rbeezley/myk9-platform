import { createContext, useCallback, useEffect, useState, ReactNode } from 'react';
import { ThemeMode, ResolvedTheme, ThemeContextType } from './themeUtils';
import { applyThemeClasses, applyFontScale, getStoredFontScale } from './themeClasses';

// eslint-disable-next-line react-refresh/only-export-components
export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'theme';

function getSystemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') {
    return getSystemPrefersDark() ? 'dark' : 'light';
  }
  return mode;
}

function readStoredMode(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'system';
  }
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark' || saved === 'system') {
    return saved;
  }
  return 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => readStoredMode());
  const [theme, setTheme] = useState<ResolvedTheme>(() => resolveTheme(readStoredMode()));

  // Apply the full theme-class trio (theme-light/theme-dark/dark) — NOT just
  // `.dark`. Toggling `.dark` alone left a stale `.theme-dark` behind (set by
  // theme-init.js / settingsStore on an OS-dark boot), which leaks the DARK
  // --accent into a LIGHT page: hover:bg-accent buttons filled near-black.
  // See applyThemeClasses for the full explanation. This applies on boot
  // (mount) and on every subsequent mode change, including 'system'.
  useEffect(() => {
    const resolved = resolveTheme(mode);
    setTheme(resolved);
    applyThemeClasses(document.documentElement, resolved === 'dark');
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  // Apply the persisted font-size scale on boot, alongside theme. Runs once
  // on mount — the ThemeProvider sits at the app root, so this is the
  // earliest React has a chance to hydrate a client preference that was
  // cached from a prior session (before any async preferences fetch).
  useEffect(() => {
    const storedScale = getStoredFontScale();
    if (storedScale) {
      applyFontScale(storedScale);
    }
  }, []);

  // While in 'system' mode, follow live OS theme changes.
  useEffect(() => {
    if (mode !== 'system' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      const resolved: ResolvedTheme = e.matches ? 'dark' : 'light';
      setTheme(resolved);
      applyThemeClasses(document.documentElement, resolved === 'dark');
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [mode]);

  const setThemeMode = useCallback((newMode: ThemeMode) => {
    setMode(newMode);
  }, []);

  const toggleTheme = useCallback(() => {
    setMode(prevMode => {
      const currentResolved = resolveTheme(prevMode);
      return currentResolved === 'light' ? 'dark' : 'light';
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, mode, setThemeMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
