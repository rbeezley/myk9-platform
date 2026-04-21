import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runAccentMigration, runAccentMigrationReverse } from './accentMigration';

// The global test setup at src/test/setup.ts replaces localStorage with
// a vi.fn() mock that doesn't retain state. Restore an in-memory
// implementation for this test file so setItem / getItem round-trip.
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
})();
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  configurable: true,
});

const STORAGE_KEY = 'myK9Q_settings';

function makePersistedSettings(accentColor: string) {
  return JSON.stringify({
    state: { settings: { accentColor } },
    version: 0,
  });
}

describe('runAccentMigration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('rewrites accentColor: green -> teal', () => {
    localStorage.setItem(STORAGE_KEY, makePersistedSettings('green'));
    runAccentMigration();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.state.settings.accentColor).toBe('teal');
  });

  it('rewrites accentColor: orange -> terracotta', () => {
    localStorage.setItem(STORAGE_KEY, makePersistedSettings('orange'));
    runAccentMigration();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.state.settings.accentColor).toBe('terracotta');
  });

  it('leaves accentColor: teal untouched', () => {
    localStorage.setItem(STORAGE_KEY, makePersistedSettings('teal'));
    runAccentMigration();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.state.settings.accentColor).toBe('teal');
  });

  it('leaves accentColor: blue untouched', () => {
    localStorage.setItem(STORAGE_KEY, makePersistedSettings('blue'));
    runAccentMigration();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.state.settings.accentColor).toBe('blue');
  });

  it('leaves accentColor: purple untouched', () => {
    localStorage.setItem(STORAGE_KEY, makePersistedSettings('purple'));
    runAccentMigration();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.state.settings.accentColor).toBe('purple');
  });

  it('no-ops when storage is empty', () => {
    expect(() => runAccentMigration()).not.toThrow();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('is idempotent across repeated runs', () => {
    localStorage.setItem(STORAGE_KEY, makePersistedSettings('green'));
    runAccentMigration();
    runAccentMigration();
    runAccentMigration();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.state.settings.accentColor).toBe('teal');
  });

  it('survives malformed JSON in storage (does not throw)', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    expect(() => runAccentMigration()).not.toThrow();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{not valid json');
  });

  it('survives localStorage.getItem throwing (Safari private mode)', () => {
    const err = new Error('QuotaExceededError');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw err;
    });
    expect(() => runAccentMigration()).not.toThrow();
  });

  it('survives localStorage.setItem throwing (quota exceeded)', () => {
    localStorage.setItem(STORAGE_KEY, makePersistedSettings('green'));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => runAccentMigration()).not.toThrow();
  });

  it('leaves unrelated settings keys intact', () => {
    const before = JSON.stringify({
      state: {
        settings: {
          accentColor: 'green',
          theme: 'dark',
          voiceRate: 1.5,
        },
      },
      version: 0,
    });
    localStorage.setItem(STORAGE_KEY, before);
    runAccentMigration();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.state.settings.theme).toBe('dark');
    expect(stored.state.settings.voiceRate).toBe(1.5);
    expect(stored.state.settings.accentColor).toBe('teal');
    expect(stored.version).toBe(0);
  });
});

describe('runAccentMigrationReverse', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('rewrites teal -> green', () => {
    localStorage.setItem(STORAGE_KEY, makePersistedSettings('teal'));
    runAccentMigrationReverse();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.state.settings.accentColor).toBe('green');
  });

  it('rewrites terracotta -> orange', () => {
    localStorage.setItem(STORAGE_KEY, makePersistedSettings('terracotta'));
    runAccentMigrationReverse();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.state.settings.accentColor).toBe('orange');
  });

  it('leaves blue / purple / green / orange untouched', () => {
    for (const value of ['blue', 'purple', 'green', 'orange']) {
      localStorage.setItem(STORAGE_KEY, makePersistedSettings(value));
      runAccentMigrationReverse();
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.state.settings.accentColor).toBe(value);
    }
  });

  it('no-ops when storage is empty', () => {
    expect(() => runAccentMigrationReverse()).not.toThrow();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('is idempotent across repeated runs', () => {
    localStorage.setItem(STORAGE_KEY, makePersistedSettings('teal'));
    runAccentMigrationReverse();
    runAccentMigrationReverse();
    runAccentMigrationReverse();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.state.settings.accentColor).toBe('green');
  });
});
