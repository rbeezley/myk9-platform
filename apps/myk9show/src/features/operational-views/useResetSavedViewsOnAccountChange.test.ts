import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useResetSavedViewsOnAccountChange } from './useResetSavedViewsOnAccountChange';
import type { KeyValueStorage } from './localViewPreferences';

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

const priorUserKey = 'operational-views:v1:user-a:entry-management';

describe('useResetSavedViewsOnAccountChange', () => {
  it("clears the PRIOR user's saved views when the authenticated user id changes", () => {
    const storage = createMemoryStorage();
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });

    storage.setItem(priorUserKey, 'saved');
    expect(storage.getItem(priorUserKey)).toBe('saved');

    const { rerender } = renderHook(
      ({ userId }: { userId: string | undefined }) => useResetSavedViewsOnAccountChange(userId),
      { initialProps: { userId: 'user-a' } }
    );

    // Sign-in as a different user on the same device.
    rerender({ userId: 'user-b' });

    expect(storage.getItem(priorUserKey)).toBeNull();
  });

  it('does not clear anything on first mount (no prior user to reset)', () => {
    const storage = createMemoryStorage();
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
    storage.setItem(priorUserKey, 'saved');

    renderHook(() => useResetSavedViewsOnAccountChange('user-a'));

    expect(storage.getItem(priorUserKey)).toBe('saved');
  });
});
