import { describe, it, expect } from 'vitest';
import {
  saveLocalView,
  restoreLocalView,
  clearLocalView,
  clearAllLocalViewsForUser,
  buildSavedViewKey,
  type KeyValueStorage,
} from './localViewPreferences';
import { ENTRY_MANAGEMENT_PRESETS, CLASS_MANAGEMENT_PRESETS } from './operationalViews';

function createMemoryStorage(): KeyValueStorage {
  const store = new Map<string, string>();
  return {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: key => {
      store.delete(key);
    },
    key: index => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

function createThrowingStorage(): KeyValueStorage {
  return {
    getItem: () => {
      throw new Error('storage unavailable');
    },
    setItem: () => {
      throw new Error('storage unavailable');
    },
    removeItem: () => {
      throw new Error('storage unavailable');
    },
    key: () => {
      throw new Error('storage unavailable');
    },
    get length(): number {
      throw new Error('storage unavailable');
    },
  };
}

const entryView = ENTRY_MANAGEMENT_PRESETS['payment-due'].build();
const classView = CLASS_MANAGEMENT_PRESETS['in-progress'].build();
const showScope = { showId: 'show-1' };

describe('save/restore round trip', () => {
  it('restores a saved entry-management view for the same user/surface/show', () => {
    const storage = createMemoryStorage();
    saveLocalView(storage, 'user-1', showScope, entryView);
    const restored = restoreLocalView(storage, 'user-1', 'entry-management', showScope);
    expect(restored?.surface).toBe('entry-management');
    expect(restored).toMatchObject({ filters: entryView.filters });
  });

  it('restores a saved class-management view', () => {
    const storage = createMemoryStorage();
    saveLocalView(storage, 'user-1', showScope, classView);
    const restored = restoreLocalView(storage, 'user-1', 'class-management', showScope);
    expect(restored).toMatchObject({ filters: classView.filters });
  });
});

describe('cross-show rejection', () => {
  it('rejects and removes a saved view scoped to a different show', () => {
    const storage = createMemoryStorage();
    saveLocalView(storage, 'user-1', { showId: 'show-1' }, entryView);
    const restored = restoreLocalView(storage, 'user-1', 'entry-management', { showId: 'show-2' });
    expect(restored).toBeNull();
    // Removed, not just skipped — a later restore for the ORIGINAL show also fails.
    const restoredAgain = restoreLocalView(storage, 'user-1', 'entry-management', {
      showId: 'show-1',
    });
    expect(restoredAgain).toBeNull();
  });

  it('rejects a saved view scoped to a different trial within the same show', () => {
    const storage = createMemoryStorage();
    saveLocalView(storage, 'user-1', { showId: 'show-1', trialId: 'trial-a' }, entryView);
    const restored = restoreLocalView(storage, 'user-1', 'entry-management', {
      showId: 'show-1',
      trialId: 'trial-b',
    });
    expect(restored).toBeNull();
  });
});

describe('user-namespace isolation', () => {
  it('does not restore another user\'s saved view', () => {
    const storage = createMemoryStorage();
    saveLocalView(storage, 'user-1', showScope, entryView);
    const restored = restoreLocalView(storage, 'user-2', 'entry-management', showScope);
    expect(restored).toBeNull();
  });

  it('keys are namespaced by user and surface', () => {
    const keyA = buildSavedViewKey('user-1', 'entry-management');
    const keyB = buildSavedViewKey('user-2', 'entry-management');
    const keyC = buildSavedViewKey('user-1', 'class-management');
    expect(keyA).not.toBe(keyB);
    expect(keyA).not.toBe(keyC);
  });

  it('clearAllLocalViewsForUser only removes the target user\'s keys', () => {
    const storage = createMemoryStorage();
    saveLocalView(storage, 'user-1', showScope, entryView);
    saveLocalView(storage, 'user-1', showScope, classView);
    saveLocalView(storage, 'user-2', showScope, entryView);

    clearAllLocalViewsForUser(storage, 'user-1');

    expect(restoreLocalView(storage, 'user-1', 'entry-management', showScope)).toBeNull();
    expect(restoreLocalView(storage, 'user-1', 'class-management', showScope)).toBeNull();
    expect(restoreLocalView(storage, 'user-2', 'entry-management', showScope)).not.toBeNull();
  });

  it('clearLocalView removes a single surface entry for a user', () => {
    const storage = createMemoryStorage();
    saveLocalView(storage, 'user-1', showScope, entryView);
    saveLocalView(storage, 'user-1', showScope, classView);
    clearLocalView(storage, 'user-1', 'entry-management');
    expect(restoreLocalView(storage, 'user-1', 'entry-management', showScope)).toBeNull();
    expect(restoreLocalView(storage, 'user-1', 'class-management', showScope)).not.toBeNull();
  });
});

describe('version mismatch handling', () => {
  it('rejects and removes a stored record with a stale version', () => {
    const storage = createMemoryStorage();
    saveLocalView(storage, 'user-1', showScope, entryView);
    const key = buildSavedViewKey('user-1', 'entry-management');
    const raw = JSON.parse(storage.getItem(key) as string);
    raw.version = 999;
    storage.setItem(key, JSON.stringify(raw));

    const restored = restoreLocalView(storage, 'user-1', 'entry-management', showScope);
    expect(restored).toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });
});

describe('storage-unavailable fallback', () => {
  it('saveLocalView does not throw when storage is unavailable', () => {
    const storage = createThrowingStorage();
    expect(() => saveLocalView(storage, 'user-1', showScope, entryView)).not.toThrow();
  });

  it('restoreLocalView returns null (not throw) when storage is unavailable', () => {
    const storage = createThrowingStorage();
    expect(() => restoreLocalView(storage, 'user-1', 'entry-management', showScope)).not.toThrow();
    expect(restoreLocalView(storage, 'user-1', 'entry-management', showScope)).toBeNull();
  });

  it('handles a missing storage backend (undefined) gracefully', () => {
    expect(() => saveLocalView(undefined, 'user-1', showScope, entryView)).not.toThrow();
    expect(restoreLocalView(undefined, 'user-1', 'entry-management', showScope)).toBeNull();
    expect(() => clearAllLocalViewsForUser(undefined, 'user-1')).not.toThrow();
  });

  it('handles corrupted JSON in a stored record', () => {
    const storage = createMemoryStorage();
    const key = buildSavedViewKey('user-1', 'entry-management');
    storage.setItem(key, '{not valid json');
    expect(restoreLocalView(storage, 'user-1', 'entry-management', showScope)).toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });
});
