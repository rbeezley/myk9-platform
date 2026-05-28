/**
 * Tests for useEntryListData — React Query orchestration for the entry list.
 *
 * Moved from apps/myk9q/src/pages/EntryList/hooks/useEntryListData.test.tsx
 * in PR E2b alongside the implementation. The tests are STRICTLY simpler
 * in this location because the hook now takes its dependencies as a
 * single injected object — no `vi.mock('@/contexts/AuthContext', ...)` /
 * `vi.mock('@/utils/replicationHelper', ...)` factories needed. Each
 * test builds its own deps with `vi.fn()` slots and asserts on the
 * mocks directly.
 *
 * Coverage matches what shipped in PR E1.5 plus the new "dependency
 * subscription cleanup on unmount" test that's only possible to assert
 * cleanly with the injected `subscribeToReplicationChanges` shape.
 *
 *   1. Disabled state — query stays idle when classId/licenseKey are missing
 *   2. Single-class path — calls `fetchSingleClass` with auth role + license
 *   3. Combined-class path — calls `fetchCombinedClasses` instead
 *   4. refresh(false) just refetches; refresh(true) calls
 *      `forceSyncEntriesAndClasses` THEN refetches
 *   5. Concurrent-force-sync guard — a second force sync while the first
 *      is in flight bails out
 *   6. Role defaults to `exhibitor` when null
 *   7. Sync error swallowed → still refetches (offline fallback)
 *   8. Subscription is cleaned up on unmount (regression net for the
 *      replication-pubsub leak this hook is the only consumer of)
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useEntryListData } from './useEntryListData';
import type { EntryListData, EntryListDataDependencies } from '../types';

vi.mock('@myk9/core', async () => {
  const actual = await vi.importActual<typeof import('@myk9/core')>('@myk9/core');
  return {
    ...actual,
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
  };
});

const LICENSE_KEY = 'license-1';

/**
 * Build a fresh `EntryListDataDependencies` for each test. Pass in
 * overrides for the methods/auth fields under assertion. Defaults make
 * the hook quiescent (returns empty data, no-op sync, no-op subscribe).
 */
function makeDeps(over: Partial<EntryListDataDependencies> = {}): EntryListDataDependencies {
  const emptyData: EntryListData = { entries: [], classInfo: null };
  return {
    auth: {
      role: 'exhibitor',
      showContext: { licenseKey: LICENSE_KEY },
    },
    fetchSingleClass: vi.fn().mockResolvedValue(emptyData),
    fetchCombinedClasses: vi.fn().mockResolvedValue(emptyData),
    forceSyncEntriesAndClasses: vi.fn().mockResolvedValue(undefined),
    subscribeToReplicationChanges: vi.fn().mockReturnValue(() => undefined),
    ...over,
  };
}

function makeWrapper() {
  // Fresh QueryClient per test → no cross-test cache bleed.
  // retry: false → failing queries surface immediately rather than
  // retrying and bloating test runtime.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useEntryListData — disabled state', () => {
  it('returns empty entries and null classInfo when classId is missing', async () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useEntryListData({ dependencies: deps }), {
      wrapper: makeWrapper(),
    });

    expect(result.current.entries).toEqual([]);
    expect(result.current.classInfo).toBeNull();
    expect(result.current.isCombinedView).toBe(false);
    expect(deps.fetchSingleClass).not.toHaveBeenCalled();
    expect(deps.fetchCombinedClasses).not.toHaveBeenCalled();
  });

  it('stays disabled when licenseKey is missing (no showContext)', async () => {
    const deps = makeDeps({
      auth: { role: 'exhibitor', showContext: null },
    });

    renderHook(() => useEntryListData({ classId: 'cls-1', dependencies: deps }), {
      wrapper: makeWrapper(),
    });

    // Give React Query a tick to potentially trigger a query — it should not.
    await new Promise(r => setTimeout(r, 10));
    expect(deps.fetchSingleClass).not.toHaveBeenCalled();
  });
});

describe('useEntryListData — single class path', () => {
  it('calls fetchSingleClass with classId, licenseKey, and role', async () => {
    const payload: EntryListData = {
      entries: [{ id: '1', armband: 1 } as never],
      classInfo: { className: 'Novice A', element: 'Container', level: 'Novice' },
    };
    const deps = makeDeps({
      fetchSingleClass: vi.fn().mockResolvedValue(payload),
    });

    const { result } = renderHook(() => useEntryListData({ classId: 'cls-1', dependencies: deps }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.entries).toBe(payload.entries);
    });
    expect(result.current.classInfo).toBe(payload.classInfo);
    expect(deps.fetchSingleClass).toHaveBeenCalledWith('cls-1', LICENSE_KEY, 'exhibitor');
    expect(deps.fetchCombinedClasses).not.toHaveBeenCalled();
  });

  it('defaults missing role to "exhibitor"', async () => {
    const deps = makeDeps({
      auth: { role: null, showContext: { licenseKey: LICENSE_KEY } },
    });

    renderHook(() => useEntryListData({ classId: 'cls-1', dependencies: deps }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(deps.fetchSingleClass).toHaveBeenCalledWith('cls-1', LICENSE_KEY, 'exhibitor');
    });
  });
});

describe('useEntryListData — combined class path', () => {
  it('uses the combined fetcher when classIdA + classIdB are provided', async () => {
    const payload: EntryListData = {
      entries: [{ id: '11' } as never, { id: '22' } as never],
      classInfo: { className: 'Combined Open', element: 'Container', level: 'Open' },
    };
    const deps = makeDeps({
      fetchCombinedClasses: vi.fn().mockResolvedValue(payload),
    });

    const { result } = renderHook(
      () => useEntryListData({ classIdA: 'a', classIdB: 'b', dependencies: deps }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(result.current.entries).toBe(payload.entries);
    });
    expect(result.current.isCombinedView).toBe(true);
    expect(deps.fetchCombinedClasses).toHaveBeenCalledWith('a', 'b', LICENSE_KEY, 'exhibitor');
    // Single-class fetcher must NOT fire for combined view — if it did,
    // we'd have a stale single-class cache entry plus the combined entry,
    // and the next refresh would race two query keys.
    expect(deps.fetchSingleClass).not.toHaveBeenCalled();
  });
});

describe('useEntryListData — refresh()', () => {
  it('refresh(false) refetches without calling forceSyncEntriesAndClasses', async () => {
    const deps = makeDeps();

    const { result } = renderHook(() => useEntryListData({ classId: 'cls-1', dependencies: deps }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(deps.fetchSingleClass).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.refresh(false);
    });

    expect(deps.forceSyncEntriesAndClasses).not.toHaveBeenCalled();
    // refetch fires the query function a second time.
    expect(deps.fetchSingleClass).toHaveBeenCalledTimes(2);
  });

  it('refresh(true) calls forceSyncEntriesAndClasses BEFORE refetching', async () => {
    const callOrder: string[] = [];

    const fetchSingleClass = vi.fn().mockImplementation(async () => {
      callOrder.push('fetch');
      return { entries: [], classInfo: null };
    });
    const forceSyncEntriesAndClasses = vi.fn().mockImplementation(async () => {
      callOrder.push('sync');
    });

    const deps = makeDeps({ fetchSingleClass, forceSyncEntriesAndClasses });

    const { result } = renderHook(() => useEntryListData({ classId: 'cls-1', dependencies: deps }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(callOrder).toContain('fetch'));
    callOrder.length = 0; // reset before the force sync

    await act(async () => {
      await result.current.refresh(true);
    });

    expect(forceSyncEntriesAndClasses).toHaveBeenCalledWith(LICENSE_KEY);
    // Sync must complete before the refetch — assertion-first guard
    // against silently flipping the order back to "refetch then sync"
    // (which would defeat the point of a force-sync refresh).
    expect(callOrder).toEqual(['sync', 'fetch']);
  });

  it('refresh(true) is a no-op when a force sync is already in flight (concurrent guard)', async () => {
    const deps = makeDeps();

    // forceSync hangs until we release it — simulates a slow first sync
    // that a second refresh tries to interrupt.
    let release!: () => void;
    const blocked = new Promise<void>(resolve => {
      release = resolve;
    });
    deps.forceSyncEntriesAndClasses = vi.fn().mockImplementation(async () => {
      await blocked;
    });

    const { result } = renderHook(() => useEntryListData({ classId: 'cls-1', dependencies: deps }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(deps.fetchSingleClass).toHaveBeenCalled());

    // Kick off the slow first sync without awaiting it.
    let firstPromise!: Promise<void>;
    act(() => {
      firstPromise = result.current.refresh(true);
    });

    // Second sync should bail immediately.
    await act(async () => {
      await result.current.refresh(true);
    });
    expect(deps.forceSyncEntriesAndClasses).toHaveBeenCalledTimes(1);

    // Let the first sync finish — flag clears for any future syncs.
    release();
    await act(async () => {
      await firstPromise;
    });

    // A third sync after the first completes is allowed again.
    await act(async () => {
      await result.current.refresh(true);
    });
    expect(deps.forceSyncEntriesAndClasses).toHaveBeenCalledTimes(2);
  });

  it('refresh is stable across re-renders (useCallback dep contract)', async () => {
    // Regression net for PR #401: `refresh`'s dep array uses
    // `query.refetch` (referentially stable in React Query v5), not the
    // whole `query` object (fresh ref each render). If a future refactor
    // flips it back, `useEntryListEffects`'s max-time auto-apply effect
    // and CombinedEntryList's mount effect would loop. The cardinality
    // test is "rerender without input changes → same function identity."
    const deps = makeDeps();
    const { result, rerender } = renderHook(() => useEntryListData({ classId: 'cls-1', dependencies: deps }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(deps.fetchSingleClass).toHaveBeenCalled());

    const first = result.current.refresh;
    rerender();
    expect(result.current.refresh).toBe(first);
  });

  it('refresh(true) swallows a sync error and still refetches (offline fallback)', async () => {
    const deps = makeDeps({
      forceSyncEntriesAndClasses: vi.fn().mockRejectedValue(new Error('Offline')),
    });

    const { result } = renderHook(() => useEntryListData({ classId: 'cls-1', dependencies: deps }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(deps.fetchSingleClass).toHaveBeenCalledTimes(1));

    await act(async () => {
      // Must not throw — offline scenario is expected to fall through to
      // cached data via the refetch below.
      await expect(result.current.refresh(true)).resolves.toBeUndefined();
    });

    // Refetch fired despite sync rejection.
    expect(deps.fetchSingleClass).toHaveBeenCalledTimes(2);
  });
});

describe('useEntryListData — subscription lifecycle', () => {
  it('subscribes on mount and unsubscribes on unmount', async () => {
    const unsubscribe = vi.fn();
    const subscribeToReplicationChanges = vi.fn().mockReturnValue(unsubscribe);
    const deps = makeDeps({ subscribeToReplicationChanges });

    const { unmount } = renderHook(() => useEntryListData({ classId: 'cls-1', dependencies: deps }), {
      wrapper: makeWrapper(),
    });

    // Subscription wired exactly once on mount.
    expect(subscribeToReplicationChanges).toHaveBeenCalledTimes(1);
    expect(unsubscribe).not.toHaveBeenCalled();

    unmount();

    // Cleanup ran — critical for preventing the replication-pubsub leak
    // that this hook is the only consumer of (a leak here means stale
    // closures invalidating queries on unmounted React Query clients).
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('invokes the debounced invalidator when the host fires a change', async () => {
    let hostNotify!: () => void;
    const subscribeToReplicationChanges = vi.fn((cb: () => void) => {
      hostNotify = cb;
      return () => undefined;
    });
    const deps = makeDeps({ subscribeToReplicationChanges });

    const { result } = renderHook(() => useEntryListData({ classId: 'cls-1', dependencies: deps }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(deps.fetchSingleClass).toHaveBeenCalledTimes(1));

    // Fire a change — fetch should be invalidated + refetched after the
    // 500ms debounce window. Test uses a real timer + waitFor rather than
    // fake timers because React Query's invalidation is itself async.
    act(() => {
      hostNotify();
    });

    await waitFor(
      () => {
        expect(deps.fetchSingleClass).toHaveBeenCalledTimes(2);
      },
      { timeout: 2000 },
    );
  });
});
