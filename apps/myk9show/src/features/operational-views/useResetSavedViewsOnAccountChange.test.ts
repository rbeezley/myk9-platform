import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useResetSavedViewsOnAccountChange } from './useResetSavedViewsOnAccountChange';
import { saveLocalView, restoreLocalView, type KeyValueStorage } from './localViewPreferences';
import { ENTRY_MANAGEMENT_PRESETS, type EntryManagementOperationalView } from './operationalViews';

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

const view = ENTRY_MANAGEMENT_PRESETS['needs-review'].build() as EntryManagementOperationalView;
const showScope = { showId: 'show-1' };

describe('useResetSavedViewsOnAccountChange', () => {
  it('clears the PRIOR user\'s saved views when the authenticated user id changes', () => {
    const storage = createMemoryStorage();
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });

    saveLocalView(storage, 'user-a', showScope, view);
    expect(restoreLocalView(storage, 'user-a', 'entry-management', showScope)).not.toBeNull();

    const { rerender } = renderHook(
      ({ userId }: { userId: string | undefined }) => useResetSavedViewsOnAccountChange(userId),
      { initialProps: { userId: 'user-a' } }
    );

    // Sign-in as a different user on the same device.
    rerender({ userId: 'user-b' });

    expect(restoreLocalView(storage, 'user-a', 'entry-management', showScope)).toBeNull();
  });

  it('does not clear anything on first mount (no prior user to reset)', () => {
    const storage = createMemoryStorage();
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
    saveLocalView(storage, 'user-a', showScope, view);

    renderHook(() => useResetSavedViewsOnAccountChange('user-a'));

    expect(restoreLocalView(storage, 'user-a', 'entry-management', showScope)).not.toBeNull();
  });
});
