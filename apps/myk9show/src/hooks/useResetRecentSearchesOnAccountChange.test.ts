import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useResetRecentSearchesOnAccountChange } from './useResetRecentSearchesOnAccountChange';
import { buildRecentSearchesKey, type KeyValueStorage } from './useRecentSearches';

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

describe('useResetRecentSearchesOnAccountChange', () => {
  it("clears the PRIOR user's recent searches when the authenticated user id changes", () => {
    const storage = createMemoryStorage();
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });

    const key = buildRecentSearchesKey('user-a', 'dogs');
    storage.setItem(
      key,
      JSON.stringify({
        version: 1,
        userId: 'user-a',
        context: 'dogs',
        searches: [{ id: 'a-1', query: 'rex', timestamp: Date.now(), context: 'dogs' }],
      })
    );
    expect(storage.getItem(key)).not.toBeNull();

    const { rerender } = renderHook(
      ({ userId }: { userId: string | undefined }) => useResetRecentSearchesOnAccountChange(userId),
      { initialProps: { userId: 'user-a' } }
    );

    // Sign-in as a different user on the same device.
    rerender({ userId: 'user-b' });

    expect(storage.getItem(key)).toBeNull();
  });

  it('does not clear anything on first mount (no prior user to reset)', () => {
    const storage = createMemoryStorage();
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });

    const key = buildRecentSearchesKey('user-a', 'dogs');
    storage.setItem(
      key,
      JSON.stringify({
        version: 1,
        userId: 'user-a',
        context: 'dogs',
        searches: [{ id: 'a-1', query: 'rex', timestamp: Date.now(), context: 'dogs' }],
      })
    );

    renderHook(() => useResetRecentSearchesOnAccountChange('user-a'));

    expect(storage.getItem(key)).not.toBeNull();
  });

  it('clears on sign-out (userId -> undefined)', () => {
    const storage = createMemoryStorage();
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });

    const key = buildRecentSearchesKey('user-a', 'dogs');
    storage.setItem(
      key,
      JSON.stringify({
        version: 1,
        userId: 'user-a',
        context: 'dogs',
        searches: [{ id: 'a-1', query: 'rex', timestamp: Date.now(), context: 'dogs' }],
      })
    );

    const { rerender } = renderHook(
      ({ userId }: { userId: string | undefined }) => useResetRecentSearchesOnAccountChange(userId),
      { initialProps: { userId: 'user-a' as string | undefined } }
    );

    rerender({ userId: undefined });

    expect(storage.getItem(key)).toBeNull();
  });
});
