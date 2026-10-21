import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useSettingsStore } from '../settingsStore';

describe('settingsStore theme default: the app opens light until the person chooses', () => {
  const root = document.documentElement;

  beforeEach(() => {
    root.className = '';
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true, media: '(prefers-color-scheme: dark)' })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults the theme to light', () => {
    useSettingsStore.getState().resetSettings();
    expect(useSettingsStore.getState().settings.theme).toBe('light');
  });

  it('resetSettings applies light under a dark OS', () => {
    root.classList.add('theme-dark', 'dark');
    useSettingsStore.getState().resetSettings();
    expect(root.classList.contains('theme-light')).toBe(true);
    expect(root.classList.contains('theme-dark')).toBe(false);
    expect(root.classList.contains('dark')).toBe(false);
  });

  it('still follows the OS once System (auto) is chosen', () => {
    useSettingsStore.getState().updateSettings({ theme: 'auto' });
    expect(root.classList.contains('theme-dark')).toBe(true);
    expect(root.classList.contains('dark')).toBe(true);
  });
});
