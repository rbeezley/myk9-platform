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
