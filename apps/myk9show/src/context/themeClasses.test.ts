import { describe, it, expect, beforeEach } from 'vitest';
import { applyThemeClasses } from './themeClasses';

describe('applyThemeClasses', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('html');
  });

  it('applies the dark trio when isDark is true', () => {
    applyThemeClasses(root, true);
    expect(root.classList.contains('theme-dark')).toBe(true);
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.classList.contains('theme-light')).toBe(false);
    expect(root.style.colorScheme).toBe('dark');
  });

  it('applies the light trio when isDark is false', () => {
    applyThemeClasses(root, false);
    expect(root.classList.contains('theme-light')).toBe(true);
    expect(root.classList.contains('theme-dark')).toBe(false);
    expect(root.classList.contains('dark')).toBe(false);
    expect(root.style.colorScheme).toBe('light');
  });

  // Regression: the "hover turns near-black in light mode" bug.
  // A previous applier (theme-init.js / settingsStore on an OS-dark boot) had
  // set `theme-dark dark`. Switching to light must clear BOTH the `dark` and
  // the `theme-dark` class — leaving a stale `theme-dark` made the accent-color
  // token blocks (which match `.theme-dark`) resolve --accent to its DARK value
  // on an otherwise-light page.
  it('clears a stale theme-dark class when switching to light', () => {
    root.classList.add('theme-dark', 'dark');

    applyThemeClasses(root, false);

    expect(root.classList.contains('theme-dark')).toBe(false);
    expect(root.classList.contains('dark')).toBe(false);
    expect(root.classList.contains('theme-light')).toBe(true);
  });

  // Symmetric guard: a stale theme-light must not survive a switch to dark.
  it('clears a stale theme-light class when switching to dark', () => {
    root.classList.add('theme-light');

    applyThemeClasses(root, true);

    expect(root.classList.contains('theme-light')).toBe(false);
    expect(root.classList.contains('theme-dark')).toBe(true);
    expect(root.classList.contains('dark')).toBe(true);
  });

  it('never leaves both theme-light and theme-dark present', () => {
    applyThemeClasses(root, true);
    applyThemeClasses(root, false);
    applyThemeClasses(root, true);

    const hasLight = root.classList.contains('theme-light');
    const hasDark = root.classList.contains('theme-dark');
    expect(hasLight && hasDark).toBe(false);
    // `dark` must track `theme-dark` exactly.
    expect(root.classList.contains('dark')).toBe(hasDark);
  });
});
