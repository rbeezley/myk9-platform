import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AuthChangeEvent, Session, Subscription } from '@supabase/supabase-js';
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
  const getEntryIds = vi.fn().mockResolvedValue(new Set(['cached-entry']));
  const getPendingCount = vi.fn().mockResolvedValue(0);
  const uploadPendingMutations = vi.fn().mockResolvedValue([]);
  const getEntry = vi.fn().mockResolvedValue({ showId: 'show-1', classId: 'class-1' });
  const getClass = vi.fn().mockResolvedValue({ trialId: 'trial-1' });
  // The provider re-surfaces stored conflicts on sign-in; without this the pass throws and its
  // late warning can outlive the file (EnvironmentTeardownError, MYK9-790).
  const getConflictedRows = vi.fn().mockResolvedValue([]);
  return {
    authState,
    syncSpies,
    getEntryIds,
    getPendingCount,
    uploadPendingMutations,
    getEntry,
    getClass,
    getConflictedRows,
  };
});

const { authState, syncSpies, getEntryIds, getPendingCount, uploadPendingMutations } = hoisted;

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
  replicatedShowsTable: {
    setMutationManager: vi.fn(),
    getConflictedRows: hoisted.getConflictedRows,
    sync: hoisted.syncSpies.shows,
  },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: {
    setMutationManager: vi.fn(),
    getConflictedRows: hoisted.getConflictedRows,
    sync: hoisted.syncSpies.trials,
  },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: {
    setMutationManager: vi.fn(),
    getConflictedRows: hoisted.getConflictedRows,
    sync: hoisted.syncSpies.classes,
    get: hoisted.getClass,
  },
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    setMutationManager: vi.fn(),
    getConflictedRows: hoisted.getConflictedRows,
    sync: hoisted.syncSpies.entries,
    clearCache: vi.fn(),
    getAllLocalIds: hoisted.getEntryIds,
    get: hoisted.getEntry,
  },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: {
    setMutationManager: vi.fn(),
    getConflictedRows: hoisted.getConflictedRows,
    sync: hoisted.syncSpies.dogs,
  },
}));
vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: {
    setMutationManager: vi.fn(),
    getConflictedRows: hoisted.getConflictedRows,
    sync: vi.fn().mockResolvedValue({ success: true, rowsAffected: 0 }),
    subscribe: () => () => undefined,
  },
}));
vi.mock('@/services/replication/ReplicatedClubsTable', () => ({
  replicatedClubsTable: {
    setMutationManager: vi.fn(),
    getConflictedRows: hoisted.getConflictedRows,
    sync: hoisted.syncSpies.clubs,
  },
}));
vi.mock('@/services/replication/ReplicatedJudgeAssignmentsTable', () => ({
  replicatedJudgeAssignmentsTable: {
    setMutationManager: vi.fn(),
    getConflictedRows: hoisted.getConflictedRows,
    sync: hoisted.syncSpies.judge_assignments,
  },
}));
vi.mock('@/services/replication/ReplicatedArmbandsTable', () => ({
  replicatedArmbandsTable: {
    setMutationManager: vi.fn(),
    getConflictedRows: hoisted.getConflictedRows,
    sync: hoisted.syncSpies.armbands,
  },
}));
vi.mock('@/services/replication/ReplicatedWaitlistEntriesTable', () => ({
  replicatedWaitlistEntriesTable: {
    setMutationManager: vi.fn(),
    getConflictedRows: hoisted.getConflictedRows,
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
import { useReplicationSync } from '@/hooks/useReplicationSync';
import { useReplicationSyncActions } from '@/hooks/useReplicationSyncActions';

const renders = { actions: 0, status: 0 };
let latestStatus: ReturnType<typeof useReplicationSync>['status'] | null = null;
let latestActions: ReturnType<typeof useReplicationSyncActions> | null = null;

/** Reads only `triggerSync` / `syncTable`: the shape of the consumers that moved off `status`. */
function ActionsOnlyConsumer() {
  const actions = useReplicationSyncActions();
  useEffect(() => {
    renders.actions += 1;
    latestActions = actions;
  });
  return null;
}

function StatusConsumer() {
  const { status } = useReplicationSync();
  useEffect(() => {
    renders.status += 1;
    latestStatus = status;
  });
  return null;
}

function fakeSession(): Session {
  return { user: { id: 'user-1' } } as unknown as Session;
}

describe('ReplicationSyncProvider: context split (MYK9-1367)', () => {
  beforeEach(async () => {
    authState.callback = null;
    renders.actions = 0;
    renders.status = 0;
    latestStatus = null;
    latestActions = null;
    getEntryIds.mockResolvedValue(new Set());
    getPendingCount.mockResolvedValue(0);
    uploadPendingMutations.mockResolvedValue([]);
    window.localStorage.clear();
    for (const spy of Object.values(syncSpies)) {
      spy.mockReset();
      spy.mockResolvedValue({ success: true, rowsAffected: 0 });
    }
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <NetworkStatusTestProvider
          value={{
            isOnline: true,
            quality: null,
            showOfflineMessage: false,
            retryConnection: vi.fn(),
          }}
        >
          <ReplicationSyncProvider autoSync={false} syncOnReconnect={false}>
            <ActionsOnlyConsumer />
            <StatusConsumer />
          </ReplicationSyncProvider>
        </NetworkStatusTestProvider>
      </QueryClientProvider>
    );
    await act(async () => {
      authState.callback?.('INITIAL_SESSION', fakeSession());
    });
    await act(async () => {});
  });

  it('keeps an actions-only consumer out of a status cycle that re-renders a status consumer', async () => {
    const actionsBefore = latestActions;
    const actionRendersBefore = renders.actions;
    const statusRendersBefore = renders.status;

    await act(async () => {
      await latestActions!.triggerSync([{ name: 'entries', scopeId: 'show-9' }]);
    });

    // The pass really ran and moved the status (syncing -> success)...
    expect(syncSpies.entries.mock.calls).toEqual([['show-9']]);
    expect(latestStatus!.tablesStatus.entries).toBe('success');
    expect(renders.status).toBeGreaterThan(statusRendersBefore);
    // ...without re-rendering the consumer that reads no status.
    expect(renders.actions).toBe(actionRendersBefore);
    expect(latestActions).toBe(actionsBefore);
  });
});
