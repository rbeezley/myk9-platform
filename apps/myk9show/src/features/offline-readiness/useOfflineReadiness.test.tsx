import { act, renderHook as renderHookRaw, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { replicatedShowsTable, replicatedTrialsTable } from '@/services/replication';
import { useOfflineReadiness } from './useOfflineReadiness';

/**
 * `prime()` invalidates the `['shows']` query so the surfaces that RENDER off
 * the shows replica re-read it (MYK9-205), which makes a QueryClientProvider a
 * hard requirement of this hook. Wrap every case rather than each call site.
 */
function renderHook<T>(callback: () => T) {
  const queryClient = createTestQueryClient();
  return {
    ...renderHookRaw(callback, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    }),
    queryClient,
  };
}

const { tables, rbacCache, syncSpy, refreshSpy, authState, replicationState } = vi.hoisted(() => ({
  tables: {
    trials: {
      meta: null as unknown,
      rows: [] as Array<{ id: string }>,
      pendingDeleteIds: new Set<string>(),
    },
    classes: {
      metaByTrial: new Map<string, unknown>(),
      rowsByTrial: new Map<string, Array<{ id: string }>>(),
    },
    entries: {
      meta: null as unknown,
      rows: [] as Array<{ id: string }>,
      pendingDeleteIds: new Set<string>(),
    },
    shows: { row: null as { id: string } | null },
    judgeAssignments: {
      rows: [] as Array<{ id: string }>,
      meta: null as unknown,
      readFails: false,
    },
  },
  rbacCache: { entry: null as { cachedAt: string } | null },
  syncSpy: vi.fn(async (..._args: unknown[]) => {}),
  refreshSpy: vi.fn(async () => {}),
  authState: {
    userId: 'user-1' as string | undefined,
    isAnonymous: false,
    isJudge: false,
    databaseUserId: 'person-1' as string | undefined,
  },
  replicationState: { lastSyncAt: null as number | null },
}));

const { settledListeners } = vi.hoisted(() => ({
  settledListeners: new Map<string, Set<() => void>>(),
}));

vi.mock('@/hooks/useOptionalReplicationSync', () => ({
  useOptionalReplicationSync: () => ({ status: { lastSyncAt: replicationState.lastSyncAt } }),
}));

vi.mock('@/services/replication', () => ({
  replicatedTrialsTable: {
    getSyncMetadata: vi.fn(async () => tables.trials.meta),
    getTrialsByShow: vi.fn(async () => tables.trials.rows),
    updateSyncMetadata: vi.fn(async () => {}),
    pendingDeletes: { coveredIds: vi.fn(async () => tables.trials.pendingDeleteIds) },
  },
  replicatedClassesTable: {
    getSyncMetadata: vi.fn(
      async (trialId: string) => tables.classes.metaByTrial.get(trialId) ?? null
    ),
    getClassesByTrial: vi.fn(
      async (trialId: string) => tables.classes.rowsByTrial.get(trialId) ?? []
    ),
    updateSyncMetadata: vi.fn(async () => {}),
  },
  replicatedEntriesTable: {
    getSyncMetadata: vi.fn(async () => tables.entries.meta),
    getEntriesByShow: vi.fn(async () => tables.entries.rows),
    updateSyncMetadata: vi.fn(async () => {}),
    pendingDeletes: { coveredIds: vi.fn(async () => tables.entries.pendingDeleteIds) },
  },
  replicatedShowsTable: {
    getShowById: vi.fn(async () => tables.shows.row),
    sync: vi.fn(async () => ({ success: true })),
    updateSyncMetadata: vi.fn(async () => {}),
  },
  replicatedJudgeAssignmentsTable: {
    sync: vi.fn(async () => ({ success: true })),
    getSyncMetadata: vi.fn(async () => tables.judgeAssignments.meta),
    getAll: vi.fn(async () => tables.judgeAssignments.rows),
    get getAllOrThrow() {
      return this.getAll;
    },
  },
}));

vi.mock('@/services/database/judges/assignmentReads', () => ({
  getActiveJudgeAssignmentsForShow: vi.fn(async () => tables.judgeAssignments.rows),
  readJudgeAssignmentsOrThrow: vi.fn(async () => {
    if (tables.judgeAssignments.readFails) throw new Error('IndexedDB read timed out');
    return tables.judgeAssignments.rows;
  }),
}));

vi.mock('@/context/rbacPermissionsCache', () => ({
  loadRbacPermissionsCache: vi.fn(() => rbacCache.entry),
}));

vi.mock('@/features/at-show/atShowDataAdapter', () => ({
  syncAtShowData: syncSpy,
  subscribeAtShowSyncSettled: (showId: string, listener: () => void) => {
    const listeners = settledListeners.get(showId) ?? new Set<() => void>();
    listeners.add(listener);
    settledListeners.set(showId, listeners);
    return () => listeners.delete(listener);
  },
}));

/** What `syncAtShowData` does once its rows are written (MYK9-766). */
function settleAtShowSync(showId: string) {
  for (const listener of settledListeners.get(showId) ?? []) listener();
}

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: authState.userId ? { id: authState.userId, is_anonymous: authState.isAnonymous } : null,
    hasRole: (role: string) => (authState.isJudge ? role === 'judge' : false),
    userWithRoles: authState.userId ? { databaseUserId: authState.databaseUserId } : null,
    refreshPermissions: refreshSpy,
  }),
}));

const meta = (lastIncrementalSyncAt: number, totalRows: number) => ({
  totalRows,
  expectedRemoteRows: totalRows,
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
    // clearAllMocks keeps implementations set with mockImplementation(Once);
    // reset the at-show sync so one test's behaviour never leaks into the next.
    syncSpy.mockReset().mockImplementation(async () => {});
    rbacCache.entry = null;
    tables.trials.meta = null;
    tables.trials.rows = [];
    tables.trials.pendingDeleteIds = new Set();
    tables.classes.metaByTrial.clear();
    tables.classes.rowsByTrial.clear();
    tables.entries.meta = null;
    tables.entries.rows = [];
    tables.entries.pendingDeleteIds = new Set();
    tables.shows.row = null;
    tables.judgeAssignments.rows = [];
    tables.judgeAssignments.meta = null;
    tables.judgeAssignments.readFails = false;
    authState.userId = 'user-1';
    authState.isJudge = false;
    authState.isAnonymous = false;
    authState.databaseUserId = 'person-1';
    replicationState.lastSyncAt = null;
    settledListeners.clear();
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

  it('does not trust legacy local-only row counts as offline coverage', async () => {
    primeAllSignals();
    tables.entries.meta = { totalRows: 3, lastIncrementalSyncAt: 5_000 };

    const { result } = renderHook(() => useOfflineReadiness('show-1'));

    await waitFor(() => {
      expect(result.current.readiness?.missing).toEqual(['entries']);
    });
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

  it('is not ready for a JUDGE whose assignment table was never hydrated', async () => {
    primeAllSignals();
    authState.isJudge = true;
    tables.judgeAssignments.meta = null;

    const { result } = renderHook(() => useOfflineReadiness('show-1'));

    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(false);
    });
    expect(result.current.readiness?.missing).toEqual(['judge assignments']);
  });

  it('uses the judge-filtered assignment read, not every assignment on the show', async () => {
    primeAllSignals();
    authState.isJudge = true;
    tables.judgeAssignments.meta = meta(6_000, 1);
    tables.judgeAssignments.rows = [{ id: 'assignment-1' }];

    renderHook(() => useOfflineReadiness('show-1'));

    const { getActiveJudgeAssignmentsForShow } =
      await import('@/services/database/judges/assignmentReads');
    await waitFor(() => {
      expect(getActiveJudgeAssignmentsForShow).toHaveBeenCalledWith('show-1', 'person-1');
    });
  });

  /**
   * MYK9-205 (Codex review). RingsideShowBoundary renders off the `['shows']`
   * query. Before this, a successful prime from the boundary's own recovery
   * badge flipped the badge green while the page underneath still showed the
   * cached miss — the user did exactly the right thing and nothing happened.
   */
  it('invalidates the shows query so the surface it primed re-reads the replica', async () => {
    primeAllSignals();
    tables.shows.row = null;

    const { result, queryClient } = renderHook(() => useOfflineReadiness('show-1'));
    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(false);
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      await result.current.prime();
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['shows'] });
  });

  it('still invalidates when priming fails part-way through', async () => {
    primeAllSignals();
    tables.shows.row = null;
    vi.mocked(replicatedShowsTable.sync).mockRejectedValueOnce(new Error('Failed to fetch'));

    const { result, queryClient } = renderHook(() => useOfflineReadiness('show-1'));
    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(false);
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      await result.current.prime();
    });

    // A prime that threw may still have written rows before it died, so the
    // rendered view is stale either way.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['shows'] });
    expect(result.current.primeFailed).toBe(true);
  });

  it('forces a full shows re-fetch when the show row is missing, without writing metadata', async () => {
    primeAllSignals();
    tables.shows.row = null;

    const { result } = renderHook(() => useOfflineReadiness('show-1'));
    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(false);
    });

    await act(async () => {
      await result.current.prime();
    });

    const { replicatedShowsTable } = await import('@/services/replication');
    // A club-scoped incremental sync would skip a show older than its
    // watermark; a forced full sync fetches it, with no metadata rewind that a
    // background shows sync could overwrite (MYK9-752).
    expect(replicatedShowsTable.sync).toHaveBeenCalledWith('', { forceFullSync: true });
    expect(replicatedShowsTable.updateSyncMetadata).not.toHaveBeenCalled();
  });

  it('is NOT ready for a judge whose person identity is unresolved offline', async () => {
    primeAllSignals();
    authState.isJudge = true;
    authState.databaseUserId = undefined; // profile query never ran (cold boot offline)
    tables.judgeAssignments.meta = meta(6_000, 1);
    tables.judgeAssignments.rows = [{ id: 'assignment-1' }];

    const { result } = renderHook(() => useOfflineReadiness('show-1'));

    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(false);
    });
    expect(result.current.readiness?.missing).toEqual(['judge assignments']);
  });

  // Restoring evicted rows must not depend on the server row count: when that
  // count request fails, the engine's partialReplica check never fires and an
  // incremental sync skips the unchanged evicted rows. Prime forces a full
  // re-fetch instead, and writes no sync metadata (MYK9-752, MYK9-738).
  it('restores an evicted replica in one prime by forcing a full sync, with no metadata writes', async () => {
    primeAllSignals();
    tables.entries.rows = rows(1); // metadata claims 3 — quota eviction
    tables.classes.rowsByTrial.set('trial-2', []);
    // Only a FULL re-fetch brings the unchanged evicted rows back.
    syncSpy.mockImplementation(async (...args: unknown[]) => {
      if ((args[1] as { forceFullSync?: boolean } | undefined)?.forceFullSync) primeAllSignals();
    });

    const { result } = renderHook(() => useOfflineReadiness('show-1'));
    await waitFor(() => {
      expect(result.current.readiness?.missing).toEqual(['entries', 'classes']);
    });

    await act(async () => {
      await result.current.prime();
    });

    expect(syncSpy).toHaveBeenCalledWith('show-1', { forceFullSync: true });
    await waitFor(() => expect(result.current.readiness?.ready).toBe(true));
    expect(result.current.primeFailed).toBe(false);
    const {
      replicatedEntriesTable,
      replicatedClassesTable,
      replicatedTrialsTable,
      replicatedShowsTable,
    } = await import('@/services/replication');
    for (const table of [
      replicatedEntriesTable,
      replicatedClassesTable,
      replicatedTrialsTable,
      replicatedShowsTable,
    ]) {
      expect(table.updateSyncMetadata).not.toHaveBeenCalled();
    }
  });

  it('is ready for a judge whose assignment table is hydrated but genuinely empty', async () => {
    primeAllSignals();
    authState.isJudge = true;
    tables.judgeAssignments.meta = meta(6_000, 0);
    tables.judgeAssignments.rows = [];

    const { result } = renderHook(() => useOfflineReadiness('show-1'));

    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(true);
    });
  });

  // MYK9-769: getAll() turned a failed device read into [], and with a table
  // hydrated at 0 expected rows that read as "ready". A failed read is not
  // hydrated: the badge says "Not offline ready" and keeps its Save now.
  it('is not ready, and names the judge assignments, when their read fails', async () => {
    primeAllSignals();
    authState.isJudge = true;
    tables.judgeAssignments.meta = meta(6_000, 0);
    tables.judgeAssignments.readFails = true;

    const { result } = renderHook(() => useOfflineReadiness('show-1'));

    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(false);
    });
    expect(result.current.readiness?.missing).toEqual(['judge assignments']);
  });

  it('is not ready when the filtered warm read fails after a good table read', async () => {
    primeAllSignals();
    authState.isJudge = true;
    tables.judgeAssignments.meta = meta(6_000, 0);
    const { getActiveJudgeAssignmentsForShow } =
      await import('@/services/database/judges/assignmentReads');
    vi.mocked(getActiveJudgeAssignmentsForShow).mockRejectedValueOnce(
      new Error('IndexedDB read timed out')
    );

    const { result } = renderHook(() => useOfflineReadiness('show-1'));

    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(false);
    });
    expect(result.current.readiness?.missing).toEqual(['judge assignments']);
  });

  it('treats an evicted judge assignment scope as cold', async () => {
    primeAllSignals();
    authState.isJudge = true;
    tables.judgeAssignments.meta = meta(6_000, 2);
    tables.judgeAssignments.rows = [{ id: 'assignment-1' }];

    const { result } = renderHook(() => useOfflineReadiness('show-1'));

    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(false);
    });
    expect(result.current.readiness?.missing).toEqual(['judge assignments']);
  });

  it('does not require judge assignments for a non-judge', async () => {
    primeAllSignals();
    tables.judgeAssignments.rows = [];

    const { result } = renderHook(() => useOfflineReadiness('show-1'));

    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(true);
    });
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

  it('does not let a pending local create hide an evicted entry (MYK9-752)', async () => {
    primeAllSignals();
    // The server holds 3; eviction left 2, and a pending local create brings
    // the raw local count back to 3.
    tables.entries.rows = [
      ...rows(2),
      { id: 'local-entry', _localOnly: true } as unknown as { id: string },
    ];

    const { result } = renderHook(() => useOfflineReadiness('show-1'));

    await waitFor(() => {
      expect(result.current.readiness?.missing).toEqual(['entries']);
    });
  });

  // MYK9-762: the server counts a deleted row until its queued DELETE uploads.
  it('does not read an entry deleted here, DELETE still queued, as missing', async () => {
    primeAllSignals();
    tables.entries.rows = rows(2); // the server still counts 3
    tables.entries.pendingDeleteIds = new Set(['row-deleted']);

    const { result } = renderHook(() => useOfflineReadiness('show-1'));

    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(true);
    });
  });

  it('stays ready offline after a trial is deleted here, its DELETE still queued', async () => {
    primeAllSignals();
    tables.trials.rows = [{ id: 'trial-1' }]; // the server still counts 2
    tables.trials.pendingDeleteIds = new Set(['trial-2']);

    const { result } = renderHook(() => useOfflineReadiness('show-1'));

    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(true);
    });
    expect(vi.mocked(replicatedTrialsTable.pendingDeletes.coveredIds)).toHaveBeenCalledWith(
      'show-1'
    );
  });

  it('does not let a pending delete hide a row that is genuinely missing', async () => {
    primeAllSignals();
    // The server counts 3: one deleted here (DELETE queued), one evicted.
    tables.entries.rows = rows(1);
    tables.entries.pendingDeleteIds = new Set(['row-deleted']);

    const { result } = renderHook(() => useOfflineReadiness('show-1'));

    await waitFor(() => {
      expect(result.current.readiness?.missing).toEqual(['entries']);
    });
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

    expect(syncSpy).toHaveBeenCalledWith('show-1', { forceFullSync: true });
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

  it('surfaces a prime failure instead of rejecting', async () => {
    const { result } = renderHook(() => useOfflineReadiness('show-1'));
    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(false);
    });

    syncSpy.mockRejectedValueOnce(new Error('TypeError: Failed to fetch'));

    await act(async () => {
      await expect(result.current.prime()).resolves.toBeUndefined();
    });

    expect(result.current.primeFailed).toBe(true);
    expect(result.current.priming).toBe(false);
  });

  it('degrades to unknown (no badge) when a storage probe rejects, without an unhandled rejection', async () => {
    const { replicatedTrialsTable } = await import('@/services/replication');
    vi.mocked(replicatedTrialsTable.getSyncMetadata).mockRejectedValueOnce(
      new Error('IDB transaction error')
    );
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);

    try {
      const { result } = renderHook(() => useOfflineReadiness('show-1'));

      await waitFor(() => {
        expect(result.current.checking).toBe(false);
      });
      // Let any escaped rejection surface before asserting.
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(result.current.readiness).toBeNull();
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('flags primeFailed when a sync resolves unsuccessfully instead of throwing', async () => {
    const { replicatedShowsTable } = await import('@/services/replication');
    vi.mocked(replicatedShowsTable.sync).mockResolvedValueOnce({
      success: false,
    } as Awaited<ReturnType<typeof replicatedShowsTable.sync>>);

    const { result } = renderHook(() => useOfflineReadiness('show-1'));
    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(false);
    });

    await act(async () => {
      await result.current.prime();
    });

    expect(result.current.primeFailed).toBe(true);
  });

  it('rechecks when a background replication sync completes', async () => {
    const { result, rerender } = renderHook(() => useOfflineReadiness('show-1'));
    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(false);
    });

    // A background sync finishing advances the provider's lastSyncAt; the
    // badge must notice without waiting for focus or another click.
    primeAllSignals();
    replicationState.lastSyncAt = 9_999;
    rerender();

    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(true);
    });
  });

  // MYK9-766: the at-show page hydrates through syncAtShowData, which never
  // advances the provider's lastSyncAt. A badge that checked before that sync
  // wrote its rows stayed "Not offline ready" for a device that was ready.
  it("rechecks when the at-show page's own sync settles", async () => {
    const { result } = renderHook(() => useOfflineReadiness('show-1'));
    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(false);
    });

    primeAllSignals();
    act(() => settleAtShowSync('show-1'));

    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(true);
    });
  });

  it("ignores another show's sync settling", async () => {
    const { result } = renderHook(() => useOfflineReadiness('show-1'));
    await waitFor(() => {
      expect(result.current.readiness?.ready).toBe(false);
    });
    const { replicatedEntriesTable } = await import('@/services/replication');
    const reads = vi.mocked(replicatedEntriesTable.getEntriesByShow).mock.calls.length;

    act(() => settleAtShowSync('show-2'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(vi.mocked(replicatedEntriesTable.getEntriesByShow).mock.calls.length).toBe(reads);
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
