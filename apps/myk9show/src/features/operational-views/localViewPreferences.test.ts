import { describe, expect, it } from 'vitest';
import { clearAllLocalViewsForUser, type KeyValueStorage } from './localViewPreferences';

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

describe('clearAllLocalViewsForUser', () => {
  it('removes the prior user’s saved views across surfaces and versions', () => {
    const storage = createMemoryStorage();
    const priorEntry = 'operational-views:v1:user-1:entry-management';
    const priorClass = 'operational-views:v2:user-1:class-management';
    const otherUser = 'operational-views:v1:user-2:entry-management';
    const otherNamespace = 'recent-searches:v1:user-1:entry-management';
    for (const key of [priorEntry, priorClass, otherUser, otherNamespace]) {
      storage.setItem(key, 'saved');
    }

    clearAllLocalViewsForUser(storage, 'user-1');

    expect(storage.getItem(priorEntry)).toBeNull();
    expect(storage.getItem(priorClass)).toBeNull();
    expect(storage.getItem(otherUser)).toBe('saved');
    expect(storage.getItem(otherNamespace)).toBe('saved');
  });

  it('does not throw when storage is unavailable', () => {
    const storage: KeyValueStorage = {
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
    expect(() => clearAllLocalViewsForUser(storage, 'user-1')).not.toThrow();
    expect(() => clearAllLocalViewsForUser(undefined, 'user-1')).not.toThrow();
  });
});
