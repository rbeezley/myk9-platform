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
