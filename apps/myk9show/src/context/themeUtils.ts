/** Stored theme preference, including the OS-following 'system' option. */
export type ThemeMode = 'light' | 'dark' | 'system';

/** The concrete light/dark value the app renders after resolving 'system'. */
export type ResolvedTheme = 'light' | 'dark';

export interface ThemeContextType {
  /** Resolved light/dark value — what consumers should render (icons, etc). */
  theme: ResolvedTheme;
  /** Raw stored preference — 'system' means "follow the OS". */
  mode: ThemeMode;
  /** Explicitly set the theme mode (light/dark/system). */
  setThemeMode: (mode: ThemeMode) => void;
  /** Toggle between explicit light and dark, based on the current resolved theme. */
  toggleTheme: () => void;
}

const THEME_STORAGE_KEY = 'theme';

// The device-level settings store (read by theme-init.js) keeps its own copy
// of the choice. Honor it when this provider has not written its key yet.
function readSettingsStoreMode(): ThemeMode | null {
  try {
    const raw = localStorage.getItem('myK9Q_settings');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { settings?: { theme?: unknown } } };
    const saved = parsed?.state?.settings?.theme;
    if (saved === 'auto') return 'system';
    return saved === 'light' || saved === 'dark' ? saved : null;
  } catch {
    return null;
  }
}

// INTENT: the app opens LIGHT until the person chooses. With nothing saved the
// OS dark setting must not apply; 'system' is an explicit, saved choice only.
export function readStoredMode(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'light';
  }
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark' || saved === 'system') {
    return saved;
  }
  return readSettingsStoreMode() ?? 'light';
}
