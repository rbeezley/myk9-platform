/**
 * Canonical theme-class applier.
 *
 * The app's theme is expressed on <html> as a TRIO of classes that must always
 * stay in sync:
 *   - `theme-light` / `theme-dark` — drives the accent-color token blocks in
 *     index.css (`html[data-accent='clay'].theme-dark { --accent: … }`) and the
 *     scoring design tokens (`.theme-dark { … }`).
 *   - `dark` — Tailwind's `darkMode: 'class'` switch AND the core surface token
 *     block (`.dark { --background … }`).
 *
 * The accent blocks match on BOTH `.dark` and `.theme-dark`, but the core
 * surface block matches ONLY `.dark`. If an applier toggles `.dark` without
 * also clearing a stale `.theme-dark` (or vice-versa), you get a SPLIT state:
 * a light page (`--background` light) whose `--accent` / `--primary` resolve to
 * their DARK values — e.g. `hover:bg-accent` buttons fill near-black in light
 * mode when the OS is dark. Every applier (theme-init.js, settingsStore,
 * ThemeContext) MUST go through this helper so the trio never desyncs.
 */
export function applyThemeClasses(root: HTMLElement, isDark: boolean): void {
  root.classList.remove('theme-light', 'theme-dark', 'dark');
  root.classList.add(isDark ? 'theme-dark' : 'theme-light');
  if (isDark) root.classList.add('dark');
  root.style.colorScheme = isDark ? 'dark' : 'light';
}

/**
 * Font-scale persistence + application.
 *
 * The font-size preference (small/medium/large/extra-large) is stored
 * server-side via userPreferencesService (async, requires a signed-in user),
 * which is too slow/unavailable for a synchronous app-boot apply. This
 * mirrors the theme-mode pattern: cache the last-applied scale in
 * localStorage so it can be re-applied immediately on boot (including for
 * signed-out/offline sessions), before the async preferences load resolves.
 */
const FONT_SCALE_STORAGE_KEY = 'fontScale';

export function applyFontScale(scale: string, root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--font-scale', scale);
}

export function getStoredFontScale(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(FONT_SCALE_STORAGE_KEY);
}

export function storeFontScale(scale: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(FONT_SCALE_STORAGE_KEY, scale);
}
