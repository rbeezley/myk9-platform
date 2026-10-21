import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// theme-init.js is a plain blocking script (no module system), so run its
// source against the jsdom document exactly as the browser would.
const source = readFileSync(resolve(__dirname, '../../public/theme-init.js'), 'utf8');

function runThemeInit() {
  new Function(source)();
}

function stubOsDark(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches, media: '(prefers-color-scheme: dark)' })
  );
}

function save(theme: string) {
  localStorage.setItem('myK9Q_settings', JSON.stringify({ state: { settings: { theme } } }));
}

describe('theme-init.js: the app opens light until the person chooses', () => {
  const root = document.documentElement;

  beforeEach(() => {
    localStorage.clear();
    root.className = '';
    root.style.colorScheme = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders light for a dark-OS visitor with nothing saved', () => {
    stubOsDark(true);
    runThemeInit();
    expect(root.classList.contains('theme-light')).toBe(true);
    expect(root.classList.contains('theme-dark')).toBe(false);
    expect(root.classList.contains('dark')).toBe(false);
    expect(root.style.colorScheme).toBe('light');
  });

  it('follows the OS once the person saves System (auto)', () => {
    stubOsDark(true);
    save('auto');
    runThemeInit();
    expect(root.classList.contains('theme-dark')).toBe(true);
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.style.colorScheme).toBe('dark');
  });

  it('honors a saved Dark choice', () => {
    stubOsDark(false);
    save('dark');
    runThemeInit();
    expect(root.classList.contains('theme-dark')).toBe(true);
    expect(root.classList.contains('dark')).toBe(true);
  });

  it('honors a saved Light choice under a dark OS', () => {
    stubOsDark(true);
    save('light');
    runThemeInit();
    expect(root.classList.contains('theme-light')).toBe(true);
    expect(root.classList.contains('dark')).toBe(false);
  });

  it('honors a header-toggle choice stored only under the ThemeContext key', () => {
    stubOsDark(false);
    localStorage.setItem('theme', 'dark');
    runThemeInit();
    expect(root.classList.contains('theme-dark')).toBe(true);
  });

  it('maps a stored ThemeContext "system" to the OS preference', () => {
    stubOsDark(true);
    localStorage.setItem('theme', 'system');
    runThemeInit();
    expect(root.classList.contains('theme-dark')).toBe(true);
  });
});
