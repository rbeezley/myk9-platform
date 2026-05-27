/**
 * Tests for useEntryListData — React Query orchestration for the entry list.
 *
 * Scope (PR E1.5 backfill before EntryList page move into @myk9/ringside):
 *
 *   1. Disabled state — query stays idle when classId/licenseKey are missing
 *      (returns the stable EMPTY_ENTRIES sentinel so consumers don't churn)
 *   2. Single-class path — prefers replication cache, falls back to Supabase
 *      when the cache returns null
 *   3. Combined-class path — same prefer-cache-then-fallback contract, but
 *      against the combined helpers
 *   4. refresh(false) just refetches; refresh(true) calls syncTable for both
 *      entries and classes, THEN refetches
 *   5. Concurrent-force-sync guard — a second force sync while the first is
 *      in flight bails out (the original would otherwise double-sync and
 *      double-spam the network)
 *   6. refresh is stable across renders (useCallback dep contract) — a
 *      regression here would loop CombinedEntryList's mount effect, which
 *      is the comment in the SUT
 *
 * Why this matters for the move: the EntryList page consumes `entries`,
 * `classInfo`, `refresh`, and `isCombinedView` directly. The page move
 * itself doesn't touch this hook, but if the move accidentally reroutes
 * imports through a stale path, the wired-up shape is what saves us.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useEntryListData } from './useEntryListData';
import {
  fetchFromReplicationCache,
  fetchFromSupabase,
  fetchCombinedFromReplicationCache,
  fetchCombinedFromSupabase,
} from './useEntryListDataHelpers';
import { useAuth } from '../../../contexts/AuthContext';
import { ensureReplicationManager } from '@/utils/replicationHelper';

// ----- Mocks ----------------------------------------------------------------
//
// All of these need to be module-boundary mocks because the hook reads them
// at call time. `vi.mock` factories are hoisted so they must be self-contained
// (no closure over later-declared vars without `vi.hoisted`).

vi.mock('./useEntryListDataHelpers', () => ({
  fetchFromReplicationCache: vi.fn(),
  fetchFromSupabase: vi.fn(),
  fetchCombinedFromReplicationCache: vi.fn(),
  fetchCombinedFromSupabase: vi.fn(),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/utils/replicationHelper', () => ({
  ensureReplicationManager: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ----- Test fixtures --------------------------------------------------------

const LICENSE_KEY = 'license-1';

/**
 * Returns a fake ReplicationManager. `getTable` hands back a thin object
 * with `subscribe()` returning an unsubscribe fn — the hook's useEffect
 * uses this to wire cache-change invalidations.
 */
function makeFakeManager(opts: { syncTable?: ReturnType<typeof vi.fn> } = {}) {
  const subscribe = vi.fn().mockImplementation((cb: () => void) => {
    // The real subscribe immediately fires once. The hook deliberately
    // skips the first callback — we trigger it here so that "initial done"
    // flag flips and any subsequent simulated changes would propagate.
    cb();
    return () => undefined;
  });
  return {
    syncTable: opts.syncTable ?? vi.fn().mockResolvedValue(undefined),
    getTable: vi.fn((name: string) =>
      name === 'entries' || name === 'classes' ? { subscribe } : null,
    ),
  };
}

function makeWrapper() {
  // Fresh QueryClient per test → no cross-test cache bleed.
  // retry: false → failing queries surface immediately rather than retrying
  // and bloating test runtime.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: a logged-in exhibitor with a license key. Override per test.
  vi.mocked(useAuth).mockReturnValue({
    showContext: { licenseKey: LICENSE_KEY },
    role: 'exhibitor',
  } as unknown as ReturnType<typeof useAuth>);
  vi.mocked(ensureReplicationManager).mockResolvedValue(
    makeFakeManager() as unknown as Awaited<ReturnType<typeof ensureReplicationManager>>,
  );
});

// ----------------------------------------------------------------------------

describe('useEntryListData — disabled state', () => {
  it('returns empty entries and null classInfo when classId is missing', async () => {
    const { result } = renderHook(() => useEntryListData({}), { wrapper: makeWrapper() });

    // Empty array reference is stable — the SUT exports EMPTY_ENTRIES.
    // Asserting identity across two reads would require a re-render; here
    // we just assert it's empty and isCombinedView is false.
    expect(result.current.entries).toEqual([]);
    expect(result.current.classInfo).toBeNull();
    expect(result.current.isCombinedView).toBe(false);
    expect(fetchFromReplicationCache).not.toHaveBeenCalled();
    expect(fetchFromSupabase).not.toHaveBeenCalled();
  });

  it('stays disabled when licenseKey is missing (no showContext)', async () => {
    vi.mocked(useAuth).mockReturnValue({ showContext: null, role: 'exhibitor' } as unknown as ReturnType<typeof useAuth>);

    renderHook(() => useEntryListData({ classId: 'cls-1' }), { wrapper: makeWrapper() });

    // Give React Query a tick to potentially trigger a query — it should not.
    await new Promise(r => setTimeout(r, 10));
    expect(fetchFromReplicationCache).not.toHaveBeenCalled();
    expect(fetchFromSupabase).not.toHaveBeenCalled();
  });
});

describe('useEntryListData — single class path', () => {
  it('returns the cache payload without falling back to Supabase when cache hits', async () => {
    const cachePayload = {
      entries: [{ id: 1, armband: 1 } as never],
      classInfo: { className: 'Novice A', element: 'Container', level: 'Novice' },
    };
    vi.mocked(fetchFromReplicationCache).mockResolvedValue(cachePayload);

    const { result } = renderHook(() => useEntryListData({ classId: 'cls-1' }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.entries).toBe(cachePayload.entries);
    });
    expect(result.current.classInfo).toBe(cachePayload.classInfo);
    expect(fetchFromReplicationCache).toHaveBeenCalledWith('cls-1', LICENSE_KEY, 'exhibitor');
    expect(fetchFromSupabase).not.toHaveBeenCalled();
  });

  it('falls back to Supabase when the cache returns null', async () => {
    vi.mocked(fetchFromReplicationCache).mockResolvedValue(null as never);
    const supabasePayload = {
      entries: [{ id: 9 } as never],
      classInfo: { className: 'Open', element: 'Buried', level: 'Open' },
    };
    vi.mocked(fetchFromSupabase).mockResolvedValue(supabasePayload);

    const { result } = renderHook(() => useEntryListData({ classId: 'cls-2' }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.entries).toBe(supabasePayload.entries);
    });
    expect(fetchFromSupabase).toHaveBeenCalledWith('cls-2', LICENSE_KEY, 'exhibitor');
  });

  it('defaults missing role to "exhibitor"', async () => {
    vi.mocked(useAuth).mockReturnValue({
      showContext: { licenseKey: LICENSE_KEY },
      role: null,
    } as unknown as ReturnType<typeof useAuth>);
    vi.mocked(fetchFromReplicationCache).mockResolvedValue({ entries: [], classInfo: null });

    renderHook(() => useEntryListData({ classId: 'cls-1' }), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(fetchFromReplicationCache).toHaveBeenCalledWith('cls-1', LICENSE_KEY, 'exhibitor');
    });
  });
});

describe('useEntryListData — combined class path', () => {
  it('uses the combined fetchers when classIdA + classIdB are provided', async () => {
    const cachePayload = {
      entries: [{ id: 11 } as never, { id: 22 } as never],
      classInfo: { className: 'Combined Open', element: 'Container', level: 'Open' },
    };
    vi.mocked(fetchCombinedFromReplicationCache).mockResolvedValue(cachePayload);

    const { result } = renderHook(
      () => useEntryListData({ classIdA: 'a', classIdB: 'b' }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(result.current.entries).toBe(cachePayload.entries);
    });
    expect(result.current.isCombinedView).toBe(true);
    expect(fetchCombinedFromReplicationCache).toHaveBeenCalledWith('a', 'b', LICENSE_KEY, 'exhibitor');
    // Single-class fetchers must NOT fire for combined view — if they did,
    // we'd have a stale single-class cache entry plus the combined entry,
    // and the next refresh would be racing two query keys.
    expect(fetchFromReplicationCache).not.toHaveBeenCalled();
    expect(fetchFromSupabase).not.toHaveBeenCalled();
  });

  it('falls back to combined Supabase when combined cache returns null', async () => {
    vi.mocked(fetchCombinedFromReplicationCache).mockResolvedValue(null as never);
    vi.mocked(fetchCombinedFromSupabase).mockResolvedValue({
      entries: [{ id: 1 } as never],
      classInfo: null,
    });

    const { result } = renderHook(
      () => useEntryListData({ classIdA: 'a', classIdB: 'b' }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(result.current.entries).toHaveLength(1);
    });
    expect(fetchCombinedFromSupabase).toHaveBeenCalledWith('a', 'b', LICENSE_KEY, 'exhibitor');
  });
});

describe('useEntryListData — refresh()', () => {
  it('refresh(false) refetches without syncing the manager', async () => {
    vi.mocked(fetchFromReplicationCache).mockResolvedValue({ entries: [], classInfo: null });
    const manager = makeFakeManager();
    vi.mocked(ensureReplicationManager).mockResolvedValue(
      manager as unknown as Awaited<ReturnType<typeof ensureReplicationManager>>,
    );

    const { result } = renderHook(() => useEntryListData({ classId: 'cls-1' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(fetchFromReplicationCache).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.refresh(false);
    });

    expect(manager.syncTable).not.toHaveBeenCalled();
    // refetch fires the query function a second time.
    expect(fetchFromReplicationCache).toHaveBeenCalledTimes(2);
  });

  it('refresh(true) syncs entries + classes tables BEFORE refetching', async () => {
    const callOrder: string[] = [];

    vi.mocked(fetchFromReplicationCache).mockImplementation(async () => {
      callOrder.push('fetchCache');
      return { entries: [], classInfo: null };
    });

    const syncTable = vi.fn().mockImplementation(async (name: string) => {
      callOrder.push(`sync:${name}`);
    });
    vi.mocked(ensureReplicationManager).mockResolvedValue(
      makeFakeManager({ syncTable }) as unknown as Awaited<ReturnType<typeof ensureReplicationManager>>,
    );

    const { result } = renderHook(() => useEntryListData({ classId: 'cls-1' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(callOrder).toContain('fetchCache'));
    callOrder.length = 0; // reset before the force sync

    await act(async () => {
      await result.current.refresh(true);
    });

    // Both tables synced (order between the two is unstable — they're
    // Promise.all'd — but BOTH syncs must finish before the refetch).
    expect(syncTable).toHaveBeenCalledWith('entries', { licenseKey: LICENSE_KEY });
    expect(syncTable).toHaveBeenCalledWith('classes', { licenseKey: LICENSE_KEY });

    const fetchIdx = callOrder.indexOf('fetchCache');
    const entriesSyncIdx = callOrder.indexOf('sync:entries');
    const classesSyncIdx = callOrder.indexOf('sync:classes');
    expect(fetchIdx).toBeGreaterThan(entriesSyncIdx);
    expect(fetchIdx).toBeGreaterThan(classesSyncIdx);
  });

  it('refresh(true) is a no-op when a force sync is already in flight (concurrent guard)', async () => {
    vi.mocked(fetchFromReplicationCache).mockResolvedValue({ entries: [], classInfo: null });

    // syncTable hangs until we release it — simulates a slow first sync
    // that a second refresh tries to interrupt.
    let release!: () => void;
    const blocked = new Promise<void>(resolve => {
      release = resolve;
    });
    const syncTable = vi.fn().mockImplementation(async () => {
      await blocked;
    });
    vi.mocked(ensureReplicationManager).mockResolvedValue(
      makeFakeManager({ syncTable }) as unknown as Awaited<ReturnType<typeof ensureReplicationManager>>,
    );

    const { result } = renderHook(() => useEntryListData({ classId: 'cls-1' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(fetchFromReplicationCache).toHaveBeenCalled());

    // Kick off the slow first sync without awaiting it.
    let firstPromise!: Promise<void>;
    act(() => {
      firstPromise = result.current.refresh(true);
    });

    // Second sync should bail immediately — note: syncTable was called
    // twice for the FIRST sync (entries + classes), and we expect no
    // additional calls from the second.
    await act(async () => {
      await result.current.refresh(true);
    });
    expect(syncTable).toHaveBeenCalledTimes(2);

    // Let the first sync finish — flag clears for any future syncs.
    release();
    await act(async () => {
      await firstPromise;
    });

    // A third sync after the first completes is allowed again.
    await act(async () => {
      await result.current.refresh(true);
    });
    expect(syncTable).toHaveBeenCalledTimes(4); // 2 (first) + 2 (third)
  });

  it('refresh is stable across re-renders (useCallback dep contract)', async () => {
    vi.mocked(fetchFromReplicationCache).mockResolvedValue({ entries: [], classInfo: null });

    const { result, rerender } = renderHook(() => useEntryListData({ classId: 'cls-1' }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(fetchFromReplicationCache).toHaveBeenCalled());

    const first = result.current.refresh;
    rerender();
    expect(result.current.refresh).toBe(first);
  });

  it('refresh(true) swallows a sync error and still refetches (offline fallback)', async () => {
    vi.mocked(fetchFromReplicationCache).mockResolvedValue({ entries: [], classInfo: null });

    const syncTable = vi.fn().mockRejectedValue(new Error('Offline'));
    vi.mocked(ensureReplicationManager).mockResolvedValue(
      makeFakeManager({ syncTable }) as unknown as Awaited<ReturnType<typeof ensureReplicationManager>>,
    );

    const { result } = renderHook(() => useEntryListData({ classId: 'cls-1' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(fetchFromReplicationCache).toHaveBeenCalledTimes(1));

    await act(async () => {
      // Must not throw — offline scenario is expected to fall through to
      // cached data via the refetch below.
      await expect(result.current.refresh(true)).resolves.toBeUndefined();
    });

    // Refetch fired despite sync rejection.
    expect(fetchFromReplicationCache).toHaveBeenCalledTimes(2);
  });
});
