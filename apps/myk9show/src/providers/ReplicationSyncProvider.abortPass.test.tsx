/**
 * MYK9-1624: the app-wide pass ends on offline. A hung upload cannot hold
 * isSyncing or the in-flight guard, an aborted pass never reaches the
 * entry-replica refresh (it clears every cached entry), and the pass after
 * reconnecting starts fresh with its own, unaborted signal.
 */
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkStatusTestProvider } from '@/test/utils/NetworkStatusTestProvider';
import { useReplicationSync } from '@/hooks/useReplicationSync';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';

const mocks = vi.hoisted(() => {
  const makeTable = (name: string) => ({
    name,
    setMutationManager: vi.fn(),
    sync: vi.fn(),
    get: vi.fn(),
    getAllLocalIds: vi.fn(),
    clearCache: vi.fn(),
  });
  return {
    makeTable,
    upload: vi.fn(),
    entries: makeTable('entries'),
  };
});

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        cb('INITIAL_SESSION', { user: { id: 'u1' } });
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  },
}));
vi.mock('@/services/replication/sharedMutationManager', () => ({
  mutationManager: {
    uploadPendingMutations: mocks.upload,
    restoreMutationsFromLocalStorage: vi.fn(async () => undefined),
    getPendingCount: vi.fn(async () => 0),
    getFailedMutations: vi.fn(async () => []),
  },
}));
vi.mock('@/hooks/useStoreSubscriptions', () => ({ useStoreSubscriptions: vi.fn() }));
vi.mock('./useDiscardRevertCacheSync', () => ({ useDiscardRevertCacheSync: vi.fn() }));
vi.mock('./useRegistrationsReplicaCacheSync', () => ({
  useRegistrationsReplicaCacheSync: vi.fn(),
}));
vi.mock('./useSyncPassScheduler', () => ({ useSyncPassScheduler: vi.fn() }));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: mocks.entries,
}));
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: mocks.makeTable('shows'),
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: mocks.makeTable('trials'),
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: mocks.makeTable('classes'),
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: mocks.makeTable('dogs'),
}));
vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: mocks.makeTable('dog_registrations'),
}));
vi.mock('@/services/replication/ReplicatedShowDeskPeopleTable', () => ({
  replicatedShowDeskPeopleTable: mocks.makeTable('people'),
}));
vi.mock('@/services/replication/ReplicatedClubsTable', () => ({
  replicatedClubsTable: mocks.makeTable('clubs'),
}));
vi.mock('@/services/replication/ReplicatedJudgeAssignmentsTable', () => ({
  replicatedJudgeAssignmentsTable: mocks.makeTable('judge_assignments'),
}));
vi.mock('@/services/replication/ReplicatedArmbandsTable', () => ({
  replicatedArmbandsTable: mocks.makeTable('armbands'),
}));
vi.mock('@/services/replication/ReplicatedWaitlistEntriesTable', () => ({
  replicatedWaitlistEntriesTable: mocks.makeTable('waitlist_entries'),
}));
vi.mock('@/services/replication/ReplicatedPaperworkPrintsTable', () => ({
  replicatedPaperworkPrintsTable: mocks.makeTable('paperwork_prints'),
}));

import { ReplicationSyncProvider } from './ReplicationSyncProvider';

const ENTRY_VERSION_KEY = 'myk9:entry-result-replica-version';

function ok(tableName: string) {
  return { tableName, success: true, operation: 'incremental-sync', rowsAffected: 0, duration: 0 };
}

describe('ReplicationSyncProvider pass cancellation (MYK9-1624)', () => {
  let latest: ReplicationSyncContextValue | null;

  function Probe() {
    latest = useReplicationSync();
    return null;
  }

  function renderProvider(isOnline: boolean) {
    const client = new QueryClient();
    const tree = (online: boolean) => (
      <QueryClientProvider client={client}>
        <NetworkStatusTestProvider
          value={{
            isOnline: online,
            showOfflineMessage: false,
            retryConnection: vi.fn(),
            quality: null,
          }}
        >
          <ReplicationSyncProvider autoSync={false} syncOnReconnect={false}>
            <Probe />
          </ReplicationSyncProvider>
        </NetworkStatusTestProvider>
      </QueryClientProvider>
    );
    const view = render(tree(isOnline));
    return { setOnline: (online: boolean) => view.rerender(tree(online)) };
  }

  beforeEach(() => {
    latest = null;
    window.localStorage.removeItem(ENTRY_VERSION_KEY);
    mocks.upload.mockReset();
    mocks.entries.sync.mockReset();
    mocks.entries.getAllLocalIds.mockReset().mockResolvedValue(new Set(['e1', 'e2']));
    mocks.entries.clearCache.mockReset().mockResolvedValue(undefined);
    mocks.entries.sync.mockImplementation(async () => ok('entries'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** An upload that waits on a dead connection until its signal aborts, like part 1's. */
  function hangingUpload() {
    mocks.upload.mockImplementation(
      (options?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), {
            once: true,
          });
        })
    );
  }

  it('a hung pass followed by offline ends: not syncing, no table syncing, lastSyncAt unstamped, nothing cleared', async () => {
    hangingUpload();
    const { setOnline } = renderProvider(true);
    await waitFor(() => expect(latest).not.toBeNull());

    let pass: Promise<void> | undefined;
    act(() => {
      pass = latest!.triggerSync();
    });
    await waitFor(() => expect(latest!.status.isSyncing).toBe(true));
    expect(mocks.upload).toHaveBeenCalledTimes(1);

    await act(async () => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
      await pass;
    });

    expect(latest!.status.isSyncing).toBe(false);
    expect(latest!.status.lastSyncAt).toBeNull();
    expect(Object.values(latest!.status.tablesStatus)).not.toContain('syncing');
    // The destructive step never ran, and the version marker was not claimed.
    expect(mocks.entries.getAllLocalIds).not.toHaveBeenCalled();
    expect(mocks.entries.clearCache).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(ENTRY_VERSION_KEY)).toBeNull();
    expect(mocks.entries.sync).not.toHaveBeenCalled();
  });

  it('an abort that lands while the refresh is reading the cache still skips the clear', async () => {
    mocks.upload.mockResolvedValue([]);
    let release!: (ids: Set<string>) => void;
    mocks.entries.getAllLocalIds.mockImplementation(
      () => new Promise<Set<string>>(resolve => (release = resolve))
    );
    const { setOnline } = renderProvider(true);
    await waitFor(() => expect(latest).not.toBeNull());

    let pass: Promise<void> | undefined;
    act(() => {
      pass = latest!.triggerSync();
    });
    await waitFor(() => expect(mocks.entries.getAllLocalIds).toHaveBeenCalled());

    await act(async () => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
      release(new Set(['e1']));
      await pass;
    });

    expect(mocks.entries.clearCache).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(ENTRY_VERSION_KEY)).toBeNull();
    expect(latest!.status.isSyncing).toBe(false);
    expect(latest!.status.lastSyncAt).toBeNull();
  });

  it('table syncs receive the pass signal, and an abort mid-download ends the pass unstamped', async () => {
    window.localStorage.setItem(ENTRY_VERSION_KEY, '20260620-authenticated-entry-results-view-v2');
    mocks.upload.mockResolvedValue([]);
    const seen: AbortSignal[] = [];
    mocks.entries.sync.mockImplementation(
      (_scope: string, options?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          seen.push(options!.signal!);
          options!.signal!.addEventListener('abort', () => reject(options!.signal!.reason), {
            once: true,
          });
        })
    );
    const { setOnline } = renderProvider(true);
    await waitFor(() => expect(latest).not.toBeNull());

    let pass: Promise<void> | undefined;
    act(() => {
      pass = latest!.triggerSync();
    });
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(latest!.status.tablesStatus.entries).toBe('syncing');

    await act(async () => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
      await pass;
    });

    expect(seen[0]!.aborted).toBe(true);
    expect(latest!.status.isSyncing).toBe(false);
    expect(latest!.status.lastSyncAt).toBeNull();
    expect(Object.values(latest!.status.tablesStatus)).not.toContain('syncing');
  });

  it('a table that hangs after its download, ignoring the signal, cannot hold the pass', async () => {
    window.localStorage.setItem(ENTRY_VERSION_KEY, '20260620-authenticated-entry-results-view-v2');
    mocks.upload.mockResolvedValue([]);
    let started = false;
    mocks.entries.sync.mockImplementation(() => {
      started = true;
      return new Promise(() => {});
    });
    const { setOnline } = renderProvider(true);
    await waitFor(() => expect(latest).not.toBeNull());

    let pass: Promise<void> | undefined;
    act(() => {
      pass = latest!.triggerSync();
    });
    await waitFor(() => expect(started).toBe(true));

    await act(async () => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
      await pass;
    });

    expect(latest!.status.isSyncing).toBe(false);
    expect(latest!.status.lastSyncAt).toBeNull();
    expect(Object.values(latest!.status.tablesStatus)).not.toContain('syncing');
  });

  it('after reconnecting, the next pass runs and sends with a fresh, unaborted signal', async () => {
    hangingUpload();
    const { setOnline } = renderProvider(true);
    await waitFor(() => expect(latest).not.toBeNull());

    let first: Promise<void> | undefined;
    act(() => {
      first = latest!.triggerSync();
    });
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    await act(async () => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
      await first;
    });
    const firstSignal = mocks.upload.mock.calls[0]![0].signal as AbortSignal;
    expect(firstSignal.aborted).toBe(true);

    mocks.upload.mockReset().mockResolvedValue([]);
    window.localStorage.setItem(ENTRY_VERSION_KEY, '20260620-authenticated-entry-results-view-v2');
    act(() => setOnline(true));
    await act(async () => {
      await latest!.triggerSync();
    });

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    const secondSignal = mocks.upload.mock.calls[0]![0].signal as AbortSignal;
    expect(secondSignal).not.toBe(firstSignal);
    expect(secondSignal.aborted).toBe(false);
    expect(mocks.entries.sync).toHaveBeenCalled();
    expect(latest!.status.lastSyncAt).not.toBeNull();
  });
});
