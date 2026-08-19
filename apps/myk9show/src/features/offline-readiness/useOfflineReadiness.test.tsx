import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOfflineReadiness } from './useOfflineReadiness';

const { tables, rbacCache, syncSpy, refreshSpy, authState } = vi.hoisted(() => ({
  tables: {
    trials: { meta: null as unknown, rows: [] as Array<{ id: string }> },
    classes: {
      metaByTrial: new Map<string, unknown>(),
      rowsByTrial: new Map<string, Array<{ id: string }>>(),
    },
    entries: { meta: null as unknown, rows: [] as Array<{ id: string }> },
    shows: { row: null as { id: string } | null },
  },
  rbacCache: { entry: null as { cachedAt: string } | null },
  syncSpy: vi.fn(async () => {}),
  refreshSpy: vi.fn(async () => {}),
  authState: { userId: 'user-1' as string | undefined, isAnonymous: false },
}));

vi.mock('@/services/replication', () => ({
  replicatedTrialsTable: {
    getSyncMetadata: vi.fn(async () => tables.trials.meta),
    getTrialsByShow: vi.fn(async () => tables.trials.rows),
  },
  replicatedClassesTable: {
    getSyncMetadata: vi.fn(
      async (trialId: string) => tables.classes.metaByTrial.get(trialId) ?? null
    ),
    getClassesByTrial: vi.fn(
      async (trialId: string) => tables.classes.rowsByTrial.get(trialId) ?? []
    ),
  },
  replicatedEntriesTable: {
    getSyncMetadata: vi.fn(async () => tables.entries.meta),
    getEntriesByShow: vi.fn(async () => tables.entries.rows),
  },
  replicatedShowsTable: {
    getShowById: vi.fn(async () => tables.shows.row),
    sync: vi.fn(async () => ({ success: true })),
  },
}));

vi.mock('@/context/rbacPermissionsCache', () => ({
  loadRbacPermissionsCache: vi.fn(() => rbacCache.entry),
}));

vi.mock('@/features/at-show/atShowDataAdapter', () => ({
  syncAtShowData: syncSpy,
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: authState.userId ? { id: authState.userId, is_anonymous: authState.isAnonymous } : null,
    refreshPermissions: refreshSpy,
  }),
}));

const meta = (lastIncrementalSyncAt: number, totalRows: number) => ({
  totalRows,
  lastIncrementalSyncAt,
});

const rows = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `row-${i}` }));

function primeAllSignals() {
  rbacCache.entry = { cachedAt: new Date(1_000).toISOString() };
  tables.shows.row = { id: 'show-1' };
  tables.trials.meta = meta(2_000, 2);
  tables.trials.rows = [{ id: 'trial-1' }, { id: 'trial-2' }];
  tables.classes.metaByTrial.set('trial-1', meta(3_000, 1));
  tables.classes.metaByTrial.set('trial-2', meta(4_000, 1));
  tables.classes.rowsByTrial.set('trial-1', rows(1));
  tables.classes.rowsByTrial.set('trial-2', rows(1));
  tables.entries.meta = meta(5_000, 3);
  tables.entries.rows = rows(3) as Array<{ id: string }>;
}

describe('useOfflineReadiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rbacCache.entry = null;
    tables.trials.meta = null;
    tables.trials.rows = [];
    tables.classes.metaByTrial.clear();
    tables.classes.rowsByTrial.clear();
    tables.entries.meta = null;
    tables.entries.rows = [];
    tables.shows.row = null;
    authState.userId = 'user-1';
    authState.isAnonymous = false;
  });

  it('reports ready with the oldest timestamp when everything is on disk', async () => {
    primeAllSignals();

    const { result } = renderHook(() => useOfflineReadiness('show-1'));

    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(true);
    });
    expect(result.current.readiness?.asOf).toBe(1_000);
  });

  it('reports not-ready on a cold device, naming the missing signals', async () => {
    const { result } = renderHook(() => useOfflineReadiness('show-1'));

    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(false);
    });
    expect(result.current.readiness?.missing).toEqual(
      expect.arrayContaining(['permissions', 'trials', 'classes', 'entries'])
    );
  });

  it("treats one cold trial's classes as a cold classes scope", async () => {
    primeAllSignals();
    tables.classes.metaByTrial.delete('trial-2');

    const { result } = renderHook(() => useOfflineReadiness('show-1'));

    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(false);
    });
    expect(result.current.readiness?.missing).toEqual(['classes']);
  });

  it('is not ready when the show row itself is missing locally — /at-show needs it', async () => {
    primeAllSignals();
    tables.shows.row = null;

    const { result } = renderHook(() => useOfflineReadiness('show-1'));

    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(false);
    });
    expect(result.current.readiness?.missing).toEqual(['show']);
  });

  it('treats an evicted scope (fewer local rows than the watermark counted) as cold', async () => {
    primeAllSignals();
    tables.entries.rows = rows(1); // metadata still claims 3 — quota eviction

    const { result } = renderHook(() => useOfflineReadiness('show-1'));

    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(false);
    });
    expect(result.current.readiness?.missing).toEqual(['entries']);
  });

  it('ignores a zero watermark instead of reporting a 1970 as-of', async () => {
    primeAllSignals();
    tables.entries.meta = meta(0, 3); // synced-but-empty-watermark shape

    const { result } = renderHook(() => useOfflineReadiness('show-1'));

    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(true);
    });
    expect(result.current.readiness?.asOf).toBe(1_000);
  });

  it('prime() runs the at-show sync and re-checks to ready', async () => {
    const { result } = renderHook(() => useOfflineReadiness('show-1'));
    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(false);
    });

    syncSpy.mockImplementationOnce(async () => {
      primeAllSignals();
    });
    await act(async () => {
      await result.current.prime();
    });

    expect(syncSpy).toHaveBeenCalledWith('show-1');
    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(true);
    });
  });

  it('prime() also refreshes permissions so a missing RBAC cache can heal', async () => {
    primeAllSignals();
    rbacCache.entry = null;

    const { result } = renderHook(() => useOfflineReadiness('show-1'));
    await waitFor(() => {
      expect(result.current.readiness?.missing).toEqual(['permissions']);
    });

    refreshSpy.mockImplementationOnce(async () => {
      rbacCache.entry = { cachedAt: new Date(1_000).toISOString() };
    });
    await act(async () => {
      await result.current.prime();
    });

    expect(refreshSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(true);
    });
  });

  it('returns no readiness for an anonymous passcode session', async () => {
    primeAllSignals();
    authState.isAnonymous = true;

    const { result } = renderHook(() => useOfflineReadiness('show-1'));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.readiness).toBeNull();
  });

  it('returns no readiness without a show id or user', async () => {
    authState.userId = undefined;

    const { result } = renderHook(() => useOfflineReadiness(undefined));

    expect(result.current.readiness).toBeNull();
  });
});
