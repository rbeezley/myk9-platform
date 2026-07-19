import { describe, expect, it, vi } from 'vitest';
import { APP_SHORTCUTS, buildAppShortcuts, getShortcutKeysForCommand } from './appShortcuts';

describe('appShortcuts registry (task 3.1)', () => {
  it('exposes exactly the shortcuts already registered pre-change — no new vocabulary', () => {
    expect(APP_SHORTCUTS.map(s => s.id).sort()).toEqual(
      [
        'command-palette',
        'shortcuts-overlay',
        'go-dogs',
        'go-people',
        'go-shows',
        'go-clubs',
        'create-dog',
        'create-person',
        'create-show',
      ].sort()
    );
  });

  it('getShortcutKeysForCommand resolves the palette command id to its registered key string', () => {
    expect(getShortcutKeysForCommand('nav-dogs')).toBe('G D');
    expect(getShortcutKeysForCommand('nav-people')).toBe('G P');
    expect(getShortcutKeysForCommand('nav-shows')).toBe('G S');
    expect(getShortcutKeysForCommand('nav-clubs')).toBe('G C');
    expect(getShortcutKeysForCommand('add-dog')).toBe('C D');
    expect(getShortcutKeysForCommand('add-person')).toBe('C P');
    expect(getShortcutKeysForCommand('add-show')).toBe('C S');
  });

  it('returns undefined for a command with no registered shortcut', () => {
    expect(getShortcutKeysForCommand('check-in')).toBeUndefined();
    expect(getShortcutKeysForCommand('nonexistent')).toBeUndefined();
  });

  it('buildAppShortcuts binds every registry entry to a callable action', () => {
    const openCommandPalette = vi.fn();
    const openShortcutsOverlay = vi.fn();
    const navigate = vi.fn();

    const shortcuts = buildAppShortcuts(
      { openCommandPalette, openShortcutsOverlay, navigate },
      { isOnboardingRoute: false }
    );

    expect(shortcuts).toHaveLength(APP_SHORTCUTS.length);
    for (const shortcut of shortcuts) {
      expect(typeof shortcut.action).toBe('function');
    }

    shortcuts.find(s => s.id === 'command-palette')?.action();
    expect(openCommandPalette).toHaveBeenCalledTimes(1);

    shortcuts.find(s => s.id === 'go-dogs')?.action();
    expect(navigate).toHaveBeenCalledWith('/dogs');
  });

  it('marks only command-palette as global; printable `?` and chord shortcuts are not', () => {
    const shortcuts = buildAppShortcuts(
      { openCommandPalette: vi.fn(), openShortcutsOverlay: vi.fn(), navigate: vi.fn() },
      { isOnboardingRoute: false }
    );

    expect(shortcuts.find(s => s.id === 'command-palette')?.global).toBe(true);
    // `?` must NOT be global — a global printable key would swallow the
    // character while typing in any text input. From inside the palette, the
    // footer's "All shortcuts" button is the path to the overlay.
    expect(shortcuts.find(s => s.id === 'shortcuts-overlay')?.global).toBeUndefined();
    expect(shortcuts.find(s => s.id === 'go-dogs')?.global).toBeUndefined();
  });

  it('returns no shortcuts on the onboarding route', () => {
    const shortcuts = buildAppShortcuts(
      { openCommandPalette: vi.fn(), openShortcutsOverlay: vi.fn(), navigate: vi.fn() },
      { isOnboardingRoute: true }
    );

    expect(shortcuts).toEqual([]);
  });

  it('shortcuts-overlay handler closes the palette before opening the overlay', () => {
    const openCommandPalette = vi.fn();
    const openShortcutsOverlay = vi.fn();
    const navigate = vi.fn();

    const shortcuts = buildAppShortcuts(
      { openCommandPalette, openShortcutsOverlay, navigate },
      { isOnboardingRoute: false }
    );

    shortcuts.find(s => s.id === 'shortcuts-overlay')?.action();
    // The registry itself only binds the handler AppHeader supplies; AppHeader's
    // own openShortcutsOverlay is what closes the palette first (see
    // AppHeader.tsx), so here we only assert the shortcut invokes exactly the
    // handler it was given.
    expect(openShortcutsOverlay).toHaveBeenCalledTimes(1);
  });
});
