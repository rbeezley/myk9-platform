import { createContext, useCallback, useEffect, useState, ReactNode } from 'react';
import { ThemeMode, ResolvedTheme, ThemeContextType } from './themeUtils';
import {
  applyThemeClasses,
  applyFontScale,
  getStoredFontScale,
  applyLayoutDensity,
  getStoredLayoutDensity,
  applyReduceMotion,
  getStoredReduceMotion,
  applyHighContrast,
  getStoredHighContrast,
} from './themeClasses';

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
  // Track the OS preference as its own state (updated only by the media-query
  // listener below) so `theme` is derived during render — no setState inside
  // effects (react-hooks/set-state-in-effect).
  const [systemDark, setSystemDark] = useState<boolean>(() => getSystemPrefersDark());
  const theme: ResolvedTheme = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  // Apply the full theme-class trio (theme-light/theme-dark/dark) — NOT just
  // `.dark`. Toggling `.dark` alone left a stale `.theme-dark` behind (set by
  // theme-init.js / settingsStore on an OS-dark boot), which leaks the DARK
  // --accent into a LIGHT page: hover:bg-accent buttons filled near-black.
  // See applyThemeClasses for the full explanation. This applies on boot
  // (mount) and on every subsequent mode or OS-preference change.
  useEffect(() => {
    applyThemeClasses(document.documentElement, theme === 'dark');
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode, theme]);

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

  // Apply the persisted layout density / reduce-motion / high-contrast
  // preferences on boot, same rationale as the font-scale hydration above:
  // without this, a reload shows the switch/radio as ON (server preference)
  // while the actual class was never re-applied to the DOM.
  useEffect(() => {
    const storedDensity = getStoredLayoutDensity();
    if (storedDensity) {
      applyLayoutDensity(storedDensity);
    }
    const storedReduceMotion = getStoredReduceMotion();
    if (storedReduceMotion !== null) {
      applyReduceMotion(storedReduceMotion);
    }
    const storedHighContrast = getStoredHighContrast();
    if (storedHighContrast !== null) {
      applyHighContrast(storedHighContrast);
    }
  }, []);

  // Follow live OS theme changes; while in 'system' mode the derived `theme`
  // flips with this state and the apply-effect above re-runs.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemDark(e.matches);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

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
