import { describe, it, expect, beforeEach } from 'vitest';
import {
  settleFields,
  readDeviceTheme,
  reconcileTheme,
  recordLocalThemeChange,
  seedDeviceTheme,
} from '../deviceThemeCache';
import { DEFAULT_THEME_PREFERENCES } from '@/types/user-preferences';

const SERVER = { ...DEFAULT_THEME_PREFERENCES, mode: 'light' as const };

describe('deviceThemeCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('writes a local change with its time and marks it pending', () => {
    recordLocalThemeChange('u1', { mode: 'dark' }, 5000);
    expect(readDeviceTheme('u1')).toEqual({
      theme: { mode: 'dark' },
      changedAt: { mode: 5000 },
      pending: ['mode'],
    });
    expect(readDeviceTheme('u2')).toBeNull();
  });

  it('pushes a pending change newer than the server row', () => {
    const cache = recordLocalThemeChange('u1', { mode: 'dark' }, 5000);
    const r = reconcileTheme(cache, SERVER, {}, 4000);
    expect(r.toPush).toEqual({ mode: 'dark' });
    expect(r.theme.mode).toBe('dark');
  });

  it('lets a newer server value replace an older pending change', () => {
    const cache = recordLocalThemeChange('u1', { mode: 'dark' }, 5000);
    const r = reconcileTheme(cache, { ...SERVER, mode: 'system' }, {}, 6000);
    expect(r.toPush).toEqual({});
    expect(r.theme.mode).toBe('system');
    expect(r.adoptedFromServer).toMatchObject({ mode: 'system' });
  });

  it('applies server fields a partial device copy does not hold', () => {
    const cache = recordLocalThemeChange('u1', { fontSize: 'large' }, 9000);
    const r = reconcileTheme(cache, { ...SERVER, mode: 'dark' }, {}, 6000);
    expect(r.toPush).toEqual({ fontSize: 'large' });
    expect(r.adoptedFromServer).toMatchObject({ mode: 'dark' });
    expect(r.adoptedFromServer).not.toHaveProperty('fontSize');
  });

  it('an untimed field in a timestamped row does not fall back to the row time', () => {
    const cache = recordLocalThemeChange('u1', { fontSize: 'large' }, 5000);
    const r = reconcileTheme(cache, { ...SERVER }, { mode: 9000 }, 9000);
    expect(r.toPush).toEqual({ fontSize: 'large' });
  });

  it('resolves each field on its own', () => {
    recordLocalThemeChange('u1', { mode: 'dark' }, 5000);
    const cache = recordLocalThemeChange('u1', { fontSize: 'large' }, 7000);
    const r = reconcileTheme(cache, { ...SERVER, mode: 'system', fontSize: 'medium' }, {}, 6000);
    expect(r.toPush).toEqual({ fontSize: 'large' });
    expect(r.theme).toMatchObject({ mode: 'system', fontSize: 'large' });
  });

  it('keeps a field pending if it was edited again after the sync began', () => {
    const first = recordLocalThemeChange('u1', { mode: 'dark' }, 5000);
    recordLocalThemeChange('u1', { mode: 'light' }, 6000);
    const after = settleFields('u1', { mode: 'system' }, first.changedAt);
    expect(after.pending).toEqual(['mode']);
    expect(after.theme.mode).toBe('light');
  });

  it('settles a field the sync saw unchanged', () => {
    const first = recordLocalThemeChange('u1', { mode: 'dark' }, 5000);
    const after = settleFields('u1', { mode: 'dark' }, first.changedAt);
    expect(after.pending).toEqual([]);
  });

  it('an unrelated server change does not outrank a pending field (per-field time)', () => {
    const cache = recordLocalThemeChange('u1', { mode: 'dark' }, 5000);
    // Row touched at 9000 by another preference; mode itself last changed at 1000.
    const r = reconcileTheme(cache, SERVER, { mode: 1000 }, 9000);
    expect(r.toPush).toEqual({ mode: 'dark' });
  });

  it('applies every server field when this device has no copy', () => {
    const r = reconcileTheme(null, { ...SERVER, mode: 'dark' }, {}, 1000);
    expect(r.adoptedFromServer).toMatchObject({ mode: 'dark' });
  });

  describe('a seeded first copy (MYK9-1568)', () => {
    const seedLarge = () => {
      localStorage.setItem('fontScale', '1.4');
      return seedDeviceTheme('u1');
    };

    it('beats a legacy row (no per-field times) that holds the default', () => {
      const r = reconcileTheme(seedLarge(), { ...DEFAULT_THEME_PREFERENCES }, {}, Date.now());
      expect(r.toPush).toEqual({ fontSize: 'extra-large' });
      expect(r.theme.fontSize).toBe('extra-large');
      expect(r.adoptedFromServer).not.toHaveProperty('fontSize');
    });

    it('beats an untimed default field in a timestamped row', () => {
      const r = reconcileTheme(seedLarge(), { ...DEFAULT_THEME_PREFERENCES }, { mode: 9000 }, 9000);
      expect(r.toPush).toEqual({ fontSize: 'extra-large' });
    });

    it('loses to a value the server holds that is not the default', () => {
      const r = reconcileTheme(
        seedLarge(),
        { ...DEFAULT_THEME_PREFERENCES, fontSize: 'large' },
        {},
        Date.now()
      );
      expect(r.toPush).toEqual({});
      expect(r.theme.fontSize).toBe('large');
    });

    it('loses to a default the user saved with its own field time', () => {
      const r = reconcileTheme(seedLarge(), { ...DEFAULT_THEME_PREFERENCES }, { fontSize: 2 }, 2);
      expect(r.toPush).toEqual({});
      expect(r.theme.fontSize).toBe(DEFAULT_THEME_PREFERENCES.fontSize);
    });
  });

  it('survives unreadable storage', () => {
    localStorage.setItem('myk9-device-theme-prefs:u1', '{not json');
    expect(readDeviceTheme('u1')).toBeNull();
  });
});
