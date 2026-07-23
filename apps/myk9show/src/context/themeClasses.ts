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

/**
 * Canonical fontSize-preference → scale mapping. 'small' maps to 1.0 (not
 * 0.9): tailwind.config.js pins text-xs at 0.875rem as a deliberate 14px
 * minimum for retired exhibitors / show-day tablet use, and any root scale
 * below 1 would push that floor to ~12.6px across the whole app.
 */
export const FONT_SIZE_SCALES: Record<string, string> = {
  small: '1.0',
  medium: '1.0',
  large: '1.2',
  'extra-large': '1.4',
};

export function applyFontScale(scale: string, root: HTMLElement = document.documentElement): void {
  // Clamp below-1 scales (e.g. a stale cached '0.9') to preserve the 14px
  // text-xs floor documented in tailwind.config.js.
  const clamped = Number.parseFloat(scale) < 1 ? '1' : scale;
  root.style.setProperty('--font-scale', clamped);
}

export function getStoredFontScale(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(FONT_SCALE_STORAGE_KEY);
}

export function storeFontScale(scale: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(FONT_SCALE_STORAGE_KEY, scale);
}

/**
 * Layout density / Reduce Motion / High Contrast persistence + application.
 *
 * These three accessibility/display preferences are stored server-side via
 * userPreferencesService, same as fontSize — too slow for a synchronous
 * app-boot apply. This mirrors the fontScale pattern above: cache the
 * last-applied value in localStorage so it can be re-applied immediately on
 * boot (before the async preferences load resolves), and re-apply again once
 * the loaded server preference lands (so it wins over a stale cache).
 */
const LAYOUT_DENSITY_STORAGE_KEY = 'layoutDensity';
const REDUCE_MOTION_STORAGE_KEY = 'reduceMotion';
const HIGH_CONTRAST_STORAGE_KEY = 'highContrast';

export function applyLayoutDensity(density: string, root: HTMLElement = document.body): void {
  root.className = root.className.replace(/\bdensity-\w+\b/g, '').concat(` density-${density}`);
}

export function getStoredLayoutDensity(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(LAYOUT_DENSITY_STORAGE_KEY);
}

export function storeLayoutDensity(density: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAYOUT_DENSITY_STORAGE_KEY, density);
}

export function applyReduceMotion(
  enabled: boolean,
  root: HTMLElement = document.documentElement
): void {
  root.classList.toggle('reduce-motion', enabled);
}

export function getStoredReduceMotion(): boolean | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(REDUCE_MOTION_STORAGE_KEY);
  return stored === null ? null : stored === 'true';
}

export function storeReduceMotion(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(REDUCE_MOTION_STORAGE_KEY, String(enabled));
}

export function applyHighContrast(
  enabled: boolean,
  root: HTMLElement = document.documentElement
): void {
  root.classList.toggle('high-contrast', enabled);
}

export function getStoredHighContrast(): boolean | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(HIGH_CONTRAST_STORAGE_KEY);
  return stored === null ? null : stored === 'true';
}

export function storeHighContrast(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(HIGH_CONTRAST_STORAGE_KEY, String(enabled));
}
