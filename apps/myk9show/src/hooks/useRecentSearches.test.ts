import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRecentSearches, clearAllRecentSearchesForUser, buildRecentSearchesKey, type KeyValueStorage } from './useRecentSearches';
import { useAuthContext } from '@/hooks/useAuthContext';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: vi.fn(),
}));

const mockUseAuthContext = vi.mocked(useAuthContext);

function mockUser(id: string | null) {
  mockUseAuthContext.mockReturnValue({
    user: id ? { id } : null,
  } as unknown as ReturnType<typeof useAuthContext>);
}

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

describe('useRecentSearches', () => {
  beforeEach(() => {
    const storage = createMemoryStorage();
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
  });

  it('adds a search and dedupes by query (case-insensitive)', async () => {
    mockUser('user-a');
    const { result } = renderHook(() => useRecentSearches({ context: 'dogs' }));

    await act(async () => {
      result.current.addSearch('Rex');
    });
    await act(async () => {
      result.current.addSearch('rex');
    });

    expect(result.current.recentSearches).toHaveLength(1);
    expect(result.current.recentSearches[0].query).toBe('rex');
  });

  it('caps at maxItems', async () => {
    mockUser('user-a');
    const { result } = renderHook(() => useRecentSearches({ context: 'dogs', maxItems: 2 }));

    await act(async () => {
      result.current.addSearch('one');
    });
    await act(async () => {
      result.current.addSearch('two');
    });
    await act(async () => {
      result.current.addSearch('three');
    });

    expect(result.current.recentSearches).toHaveLength(2);
    expect(result.current.recentSearches.map(s => s.query)).toEqual(['three', 'two']);
  });

  it('getSuggestions filters by current query and clearSearches empties the list', async () => {
    mockUser('user-a');
    const { result } = renderHook(() => useRecentSearches({ context: 'dogs' }));

    await act(async () => {
      result.current.addSearch('golden retriever');
    });
    await act(async () => {
      result.current.addSearch('poodle');
    });

    expect(result.current.getSuggestions('gold')).toHaveLength(1);
    expect(result.current.getSuggestions('')).toHaveLength(2);

    await act(async () => {
      result.current.clearSearches();
    });
    expect(result.current.recentSearches).toHaveLength(0);
  });

  it('removeSearch removes a single entry by id', async () => {
    mockUser('user-a');
    const { result } = renderHook(() => useRecentSearches({ context: 'dogs' }));

    await act(async () => {
      result.current.addSearch('golden retriever');
    });
    const id = result.current.recentSearches[0].id;

    await act(async () => {
      result.current.removeSearch(id);
    });
    expect(result.current.recentSearches).toHaveLength(0);
  });

  it('namespaces the storage key per user and context — user A entries never appear for user B', async () => {
    mockUser('user-a');
    const hookA = renderHook(() => useRecentSearches({ context: 'dogs' }));
    await act(async () => {
      hookA.result.current.addSearch('user-a-search');
    });

    const rawKeyA = buildRecentSearchesKey('user-a', 'dogs');
    expect(window.localStorage.getItem(rawKeyA)).not.toBeNull();

    mockUser('user-b');
    const hookB = renderHook(() => useRecentSearches({ context: 'dogs' }));
    // Allow the mount-effect microtask to resolve.
    await act(async () => {
      await Promise.resolve();
    });

    expect(hookB.result.current.recentSearches).toHaveLength(0);
  });

  it('invalid/corrupt stored JSON yields an empty list without crashing, and removes the bad entry', async () => {
    mockUser('user-a');
    const key = buildRecentSearchesKey('user-a', 'dogs');
    window.localStorage.setItem(key, '{not valid json');

    const { result } = renderHook(() => useRecentSearches({ context: 'dogs' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.recentSearches).toEqual([]);
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it('drops individually invalid entries but keeps valid ones on restore', async () => {
    mockUser('user-a');
    const key = buildRecentSearchesKey('user-a', 'dogs');
    window.localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        userId: 'user-a',
        context: 'dogs',
        searches: [
          { id: 'good-1', query: 'rex', timestamp: Date.now(), context: 'dogs' },
          { id: 'bad-1', query: 'missing-timestamp', context: 'dogs' },
          { id: 'bad-2', context: 'dogs', timestamp: Date.now(), query: '' },
          { notEvenAnObjectShape: true },
        ],
      })
    );

    const { result } = renderHook(() => useRecentSearches({ context: 'dogs' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.recentSearches).toHaveLength(1);
    expect(result.current.recentSearches[0].id).toBe('good-1');
  });

  it('legacy global key is deleted on first use', async () => {
    window.localStorage.setItem('myK9Show_recentSearches', JSON.stringify([{ id: 'legacy', query: 'x', timestamp: 1, context: 'dogs' }]));
    mockUser('user-a');

    renderHook(() => useRecentSearches({ context: 'dogs' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(window.localStorage.getItem('myK9Show_recentSearches')).toBeNull();
  });

  it('signed-out users get in-memory-only history — nothing is persisted', async () => {
    mockUser(null);
    const { result } = renderHook(() => useRecentSearches({ context: 'dogs' }));

    // Flush the mount-effect microtask (signed-out clear) before adding.
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      result.current.addSearch('anonymous search');
    });

    expect(result.current.recentSearches).toHaveLength(1);

    // Nothing namespaced should have been written for any user.
    for (let i = 0; i < window.localStorage.length; i++) {
      const storedKey = window.localStorage.key(i);
      expect(storedKey?.startsWith('recent-searches:')).toBeFalsy();
    }
  });

  it('account change clears prior user in-memory suggestions on remount', async () => {
    mockUser('user-a');
    const first = renderHook(() => useRecentSearches({ context: 'dogs' }));
    await act(async () => {
      first.result.current.addSearch('user-a-only');
    });
    expect(first.result.current.recentSearches).toHaveLength(1);

    // Simulate the account-change reset clearing user-a's persisted storage.
    clearAllRecentSearchesForUser(window.localStorage, 'user-a');

    mockUser('user-b');
    const second = renderHook(() => useRecentSearches({ context: 'dogs' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(second.result.current.recentSearches).toHaveLength(0);
    expect(window.localStorage.getItem(buildRecentSearchesKey('user-a', 'dogs'))).toBeNull();
  });
});
