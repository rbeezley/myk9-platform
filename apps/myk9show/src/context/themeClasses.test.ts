import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyThemeClasses,
  applyFontScale,
  getStoredFontScale,
  storeFontScale,
  applyLayoutDensity,
  getStoredLayoutDensity,
  storeLayoutDensity,
  applyReduceMotion,
  getStoredReduceMotion,
  storeReduceMotion,
  applyHighContrast,
  getStoredHighContrast,
  storeHighContrast,
  clearAppearanceCache,
} from './themeClasses';

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

describe('font scale helpers', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('html');
    localStorage.clear();
  });

  it('applyFontScale sets the --font-scale custom property on the given root', () => {
    applyFontScale('1.2', root);
    expect(root.style.getPropertyValue('--font-scale')).toBe('1.2');
  });

  it('storeFontScale persists the scale and getStoredFontScale reads it back', () => {
    expect(getStoredFontScale()).toBeNull();

    storeFontScale('1.4');

    expect(getStoredFontScale()).toBe('1.4');
  });

  it('getStoredFontScale returns null when nothing has been stored', () => {
    expect(getStoredFontScale()).toBeNull();
  });

  it('applyFontScale clamps sub-1 scales to preserve the 14px text-xs floor', () => {
    applyFontScale('0.9', root);
    expect(root.style.getPropertyValue('--font-scale')).toBe('1');
  });
});

describe('layout density helpers', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('body');
    localStorage.clear();
  });

  it('applyLayoutDensity adds a density-<value> class to the given root', () => {
    applyLayoutDensity('compact', root);
    expect(root.className).toContain('density-compact');
  });

  it('applyLayoutDensity replaces a previously applied density class', () => {
    applyLayoutDensity('compact', root);
    applyLayoutDensity('spacious', root);
    expect(root.className).toContain('density-spacious');
    expect(root.className).not.toContain('density-compact');
  });

  it('storeLayoutDensity persists the value and getStoredLayoutDensity reads it back', () => {
    expect(getStoredLayoutDensity()).toBeNull();
    storeLayoutDensity('spacious');
    expect(getStoredLayoutDensity()).toBe('spacious');
  });
});

describe('reduce motion helpers', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('html');
    localStorage.clear();
  });

  it('applyReduceMotion toggles the reduce-motion class', () => {
    applyReduceMotion(true, root);
    expect(root.classList.contains('reduce-motion')).toBe(true);

    applyReduceMotion(false, root);
    expect(root.classList.contains('reduce-motion')).toBe(false);
  });

  it('storeReduceMotion persists the flag and getStoredReduceMotion reads it back', () => {
    expect(getStoredReduceMotion()).toBeNull();
    storeReduceMotion(true);
    expect(getStoredReduceMotion()).toBe(true);
    storeReduceMotion(false);
    expect(getStoredReduceMotion()).toBe(false);
  });
});

describe('high contrast helpers', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('html');
    localStorage.clear();
  });

  it('applyHighContrast toggles the high-contrast class', () => {
    applyHighContrast(true, root);
    expect(root.classList.contains('high-contrast')).toBe(true);

    applyHighContrast(false, root);
    expect(root.classList.contains('high-contrast')).toBe(false);
  });

  it('storeHighContrast persists the flag and getStoredHighContrast reads it back', () => {
    expect(getStoredHighContrast()).toBeNull();
    storeHighContrast(true);
    expect(getStoredHighContrast()).toBe(true);
    storeHighContrast(false);
    expect(getStoredHighContrast()).toBe(false);
  });
});

describe('applyLayoutDensity default root', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    document.body.className = '';
  });

  it('applies to <html> by default so html.density-* scoped styles match', () => {
    applyLayoutDensity('compact');
    expect(document.documentElement.className).toContain('density-compact');
  });

  it('removes a stale density class left on <body> by older builds', () => {
    document.body.className = 'density-spacious other-class';
    applyLayoutDensity('compact');
    expect(document.body.className).not.toContain('density-spacious');
    expect(document.body.className).toContain('other-class');
  });
});

describe('clearAppearanceCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes all cached appearance keys', () => {
    storeFontScale('1.2');
    storeLayoutDensity('compact');
    storeReduceMotion(true);
    storeHighContrast(true);
    clearAppearanceCache();
    expect(getStoredFontScale()).toBeNull();
    expect(getStoredLayoutDensity()).toBeNull();
    expect(getStoredReduceMotion()).toBeNull();
    expect(getStoredHighContrast()).toBeNull();
  });

  it('resets live appearance state as well as cached values', () => {
    applyFontScale('1.4');
    applyLayoutDensity('compact');
    applyReduceMotion(true);
    applyHighContrast(true);

    clearAppearanceCache();

    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1');
    expect(document.documentElement.classList.contains('density-compact')).toBe(false);
    expect(document.documentElement.classList.contains('density-comfortable')).toBe(true);
    expect(document.documentElement.classList.contains('reduce-motion')).toBe(false);
    expect(document.documentElement.classList.contains('high-contrast')).toBe(false);
  });
});
