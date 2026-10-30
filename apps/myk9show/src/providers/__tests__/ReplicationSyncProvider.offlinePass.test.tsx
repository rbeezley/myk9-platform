import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { act, render } from '@testing-library/react';
import { useReplicationSync } from '@/hooks/useReplicationSync';
import { areReplicationTablesPendingFirstSync } from '@/utils/replicationSyncEmptyState';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AuthChangeEvent, Session, Subscription } from '@supabase/supabase-js';
import { notifications } from '@/lib/notifications';
import { NetworkStatusTestProvider } from '@/test/utils/NetworkStatusTestProvider';

type AuthCallback = (event: AuthChangeEvent, session: Session | null) => void;

const hoisted = vi.hoisted(() => {
  const authState: { callback: AuthCallback | null } = { callback: null };
  const makeSyncSpy = () => vi.fn().mockResolvedValue({ success: true, rowsAffected: 0 });
  const syncSpies = {
    shows: makeSyncSpy(),
    trials: makeSyncSpy(),
    classes: makeSyncSpy(),
    entries: makeSyncSpy(),
    dogs: makeSyncSpy(),
    clubs: makeSyncSpy(),
    judge_assignments: makeSyncSpy(),
    armbands: makeSyncSpy(),
    waitlist_entries: makeSyncSpy(),
  };
  const getPendingCount = vi.fn().mockResolvedValue(0);
  const uploadPendingMutations = vi.fn().mockResolvedValue([]);
  const getEntry = vi.fn().mockResolvedValue({ showId: 'show-1', classId: 'class-1' });
  const getClass = vi.fn().mockResolvedValue({ trialId: 'trial-1' });
  return {
    authState,
    syncSpies,
    getPendingCount,
    uploadPendingMutations,
    getEntry,
    getClass,
  };
});

const { authState, syncSpies, getPendingCount, uploadPendingMutations } = hoisted;

vi.mock('@/lib/notifications', () => ({
  notifications: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/hooks/useStoreSubscriptions', () => ({
  useStoreSubscriptions: () => undefined,
}));

vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: { setMutationManager: vi.fn(), sync: hoisted.syncSpies.shows },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { setMutationManager: vi.fn(), sync: hoisted.syncSpies.trials },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: {
    setMutationManager: vi.fn(),
    sync: hoisted.syncSpies.classes,
    get: hoisted.getClass,
  },
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    setMutationManager: vi.fn(),
    sync: hoisted.syncSpies.entries,
    clearCache: vi.fn().mockResolvedValue(undefined),
    getAllLocalIds: async () => new Set(['cached-entry']),
    get: hoisted.getEntry,
  },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { setMutationManager: vi.fn(), sync: hoisted.syncSpies.dogs },
}));
vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: {
    setMutationManager: vi.fn(),
    sync: vi.fn().mockResolvedValue({ success: true, rowsAffected: 0 }),
    subscribe: () => () => undefined,
  },
}));
vi.mock('@/services/replication/ReplicatedClubsTable', () => ({
  replicatedClubsTable: { setMutationManager: vi.fn(), sync: hoisted.syncSpies.clubs },
}));
vi.mock('@/services/replication/ReplicatedJudgeAssignmentsTable', () => ({
  replicatedJudgeAssignmentsTable: {
    setMutationManager: vi.fn(),
    sync: hoisted.syncSpies.judge_assignments,
  },
}));
vi.mock('@/services/replication/ReplicatedArmbandsTable', () => ({
  replicatedArmbandsTable: { setMutationManager: vi.fn(), sync: hoisted.syncSpies.armbands },
}));
vi.mock('@/services/replication/ReplicatedWaitlistEntriesTable', () => ({
  replicatedWaitlistEntriesTable: {
    setMutationManager: vi.fn(),
    sync: hoisted.syncSpies.waitlist_entries,
  },
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: AuthCallback) => {
        hoisted.authState.callback = cb;
        return {
          data: {
            subscription: { unsubscribe: vi.fn() } as unknown as Subscription,
          },
        };
      },
    },
  },
}));

vi.mock(import('@myk9/replication'), async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    MutationManager: class {
      rowRefetchers = { register: () => () => undefined };
      uploadPendingMutations = hoisted.uploadPendingMutations;
      getPendingCount = hoisted.getPendingCount;
      restoreMutationsFromLocalStorage = vi.fn().mockResolvedValue(undefined);
    } as unknown as typeof actual.MutationManager,
  };
});

import { ReplicationSyncProvider } from '../ReplicationSyncProvider';

const probe: { status: ReturnType<typeof useReplicationSync>['status'] | null } = { status: null };

function StatusProbe() {
  const { status } = useReplicationSync();
  useEffect(() => {
    probe.status = status;
  });
  return null;
}

function renderProvider() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <NetworkStatusTestProvider
        value={{
          isOnline: true,
          quality: null,
          showOfflineMessage: false,
          retryConnection: vi.fn(),
        }}
      >
        <ReplicationSyncProvider autoSync={false} syncOnReconnect={false}>
          <StatusProbe />
        </ReplicationSyncProvider>
      </NetworkStatusTestProvider>
    </QueryClientProvider>
  );
}

function fakeSession(): Session {
  return { access_token: 'tok', user: { id: 'u1' } } as unknown as Session;
}

function dispatchRingsideUpload() {
  window.dispatchEvent(
    new CustomEvent('replication:upload-complete', {
      detail: {
        tables: ['entries'],
        count: 1,
        mutations: [
          {
            tableName: 'entries',
            operation: 'UPDATE',
            rowId: 'entry-1',
            rpcName: 'ringside_update_entry',
          },
        ],
      },
    })
  );
}

describe('ReplicationSyncProvider — pass stuck on a dead connection (MYK9-1509)', () => {
  beforeEach(() => {
    authState.callback = null;
    probe.status = null;
    getPendingCount.mockReset();
    getPendingCount.mockResolvedValue(0);
    uploadPendingMutations.mockReset();
    uploadPendingMutations.mockResolvedValue([]);
    window.localStorage.clear();
    for (const spy of Object.values(syncSpies)) spy.mockClear();
  });

  it('ends a hung pass when the device goes offline and releases the loading gate', async () => {
    renderProvider();
    await act(async () => {
      authState.callback?.('INITIAL_SESSION', fakeSession());
    });
    syncSpies.entries.mockImplementationOnce(() => new Promise(() => {}));

    await act(async () => {
      dispatchRingsideUpload();
    });
    expect(probe.status?.isSyncing).toBe(true);
    expect(probe.status?.tablesStatus.entries).toBe('syncing');
    expect(areReplicationTablesPendingFirstSync(probe.status!, ['entries'])).toBe(true);

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(probe.status?.isSyncing).toBe(false);
    expect(probe.status?.tablesStatus.entries).not.toBe('syncing');
    expect(probe.status?.lastSyncAt).toBeNull();
    expect(areReplicationTablesPendingFirstSync(probe.status!, ['entries'])).toBe(false);
    expect(notifications.error).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
