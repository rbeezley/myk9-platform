import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOfflineReadiness } from './useOfflineReadiness';

const { tables, rbacCache, syncSpy, authState } = vi.hoisted(() => ({
  tables: {
    trials: { meta: null as unknown, trialsByShow: [] as Array<{ id: string }> },
    classes: { metaByTrial: new Map<string, unknown>() },
    entries: { meta: null as unknown },
  },
  rbacCache: { entry: null as { cachedAt: string } | null },
  syncSpy: vi.fn(async () => {}),
  authState: { userId: 'user-1' as string | undefined },
}));

vi.mock('@/services/replication', () => ({
  replicatedTrialsTable: {
    getSyncMetadata: vi.fn(async () => tables.trials.meta),
    getTrialsByShow: vi.fn(async () => tables.trials.trialsByShow),
  },
  replicatedClassesTable: {
    getSyncMetadata: vi.fn(
      async (trialId: string) => tables.classes.metaByTrial.get(trialId) ?? null
    ),
  },
  replicatedEntriesTable: {
    getSyncMetadata: vi.fn(async () => tables.entries.meta),
  },
}));

vi.mock('@/context/rbacPermissionsCache', () => ({
  loadRbacPermissionsCache: vi.fn(() => rbacCache.entry),
}));

vi.mock('@/features/at-show/atShowDataAdapter', () => ({
  syncAtShowData: syncSpy,
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: authState.userId ? { id: authState.userId } : null }),
}));

const hydratedMeta = (lastIncrementalSyncAt: number) => ({ totalRows: 5, lastIncrementalSyncAt });

function primeAllSignals() {
  rbacCache.entry = { cachedAt: new Date(1_000).toISOString() };
  tables.trials.meta = hydratedMeta(2_000);
  tables.trials.trialsByShow = [{ id: 'trial-1' }, { id: 'trial-2' }];
  tables.classes.metaByTrial.set('trial-1', hydratedMeta(3_000));
  tables.classes.metaByTrial.set('trial-2', hydratedMeta(4_000));
  tables.entries.meta = hydratedMeta(5_000);
}

describe('useOfflineReadiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rbacCache.entry = null;
    tables.trials.meta = null;
    tables.trials.trialsByShow = [];
    tables.classes.metaByTrial.clear();
    tables.entries.meta = null;
    authState.userId = 'user-1';
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

  it('returns no readiness without a show id or user', async () => {
    authState.userId = undefined;

    const { result } = renderHook(() => useOfflineReadiness(undefined));

    expect(result.current.readiness).toBeNull();
  });
});
