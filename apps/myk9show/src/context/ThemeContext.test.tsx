import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { ThemeProvider } from './ThemeContext';
import { useTheme } from '@/hooks/useTheme';

/**
 * Minimal matchMedia mock supporting a mutable `matches` value and
 * addEventListener/removeEventListener so tests can simulate OS theme
 * changes for 'system' mode.
 */
function createMatchMediaMock(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(e: MediaQueryListEvent) => void>();

  const mql = {
    get matches() {
      return matches;
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_event: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.add(cb);
    },
    removeEventListener: (_event: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.delete(cb);
    },
  };

  return {
    matchMedia: vi.fn().mockReturnValue(mql),
    fireChange: (nextMatches: boolean) => {
      matches = nextMatches;
      listeners.forEach(cb => cb({ matches: nextMatches } as MediaQueryListEvent));
    },
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe('ThemeContext', () => {
  const root = document.documentElement;

  beforeEach(() => {
    localStorage.clear();
    root.classList.remove('theme-light', 'theme-dark', 'dark');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies the light trio and resolves theme="light" for explicit light mode', () => {
    vi.stubGlobal('matchMedia', createMatchMediaMock(false).matchMedia);
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setThemeMode('light');
    });

    expect(result.current.mode).toBe('light');
    expect(result.current.theme).toBe('light');
    expect(root.classList.contains('theme-light')).toBe(true);
    expect(root.classList.contains('dark')).toBe(false);
  });

  it('applies the dark trio and resolves theme="dark" for explicit dark mode', () => {
    vi.stubGlobal('matchMedia', createMatchMediaMock(false).matchMedia);
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setThemeMode('dark');
    });

    expect(result.current.mode).toBe('dark');
    expect(result.current.theme).toBe('dark');
    expect(root.classList.contains('theme-dark')).toBe(true);
    expect(root.classList.contains('dark')).toBe(true);
  });

  it('resolves system mode from prefers-color-scheme and keeps the trio synced', () => {
    const { fireChange, matchMedia } = createMatchMediaMock(true); // OS is dark
    vi.stubGlobal('matchMedia', matchMedia);
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setThemeMode('system');
    });

    expect(result.current.mode).toBe('system');
    expect(result.current.theme).toBe('dark');
    expect(root.classList.contains('theme-dark')).toBe(true);
    expect(root.classList.contains('dark')).toBe(true);

    // OS flips to light while still in 'system' mode.
    act(() => {
      fireChange(false);
    });

    expect(result.current.theme).toBe('light');
    expect(root.classList.contains('theme-light')).toBe(true);
    expect(root.classList.contains('theme-dark')).toBe(false);
    expect(root.classList.contains('dark')).toBe(false);
  });

  it('never leaves a stale theme-dark/theme-light when switching modes', () => {
    vi.stubGlobal('matchMedia', createMatchMediaMock(false).matchMedia);
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => result.current.setThemeMode('dark'));
    act(() => result.current.setThemeMode('light'));

    expect(root.classList.contains('theme-dark')).toBe(false);
    expect(root.classList.contains('theme-light')).toBe(true);
    expect(root.classList.contains('dark')).toBe(false);
  });

  it('applies the persisted mode on boot (mount) without an explicit call', () => {
    localStorage.setItem('theme', 'dark');
    vi.stubGlobal('matchMedia', createMatchMediaMock(false).matchMedia);

    renderHook(() => useTheme(), { wrapper });

    expect(root.classList.contains('theme-dark')).toBe(true);
    expect(root.classList.contains('dark')).toBe(true);
  });

  it('toggleTheme flips the resolved theme and escapes system mode explicitly', () => {
    vi.stubGlobal('matchMedia', createMatchMediaMock(true).matchMedia); // OS dark
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => result.current.setThemeMode('system'));
    expect(result.current.theme).toBe('dark');

    act(() => result.current.toggleTheme());

    expect(result.current.mode).toBe('light');
    expect(result.current.theme).toBe('light');
  });
});
