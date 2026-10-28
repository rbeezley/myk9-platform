import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    paperwork_prints: makeSyncSpy(),
  };
  const getEntryIds = vi.fn().mockResolvedValue(new Set(['cached-entry']));
  const getPendingCount = vi.fn().mockResolvedValue(0);
  const uploadPendingMutations = vi.fn().mockResolvedValue([]);
  const getEntry = vi.fn().mockResolvedValue({ showId: 'show-1', classId: 'class-1' });
  const getClass = vi.fn().mockResolvedValue({ trialId: 'trial-1' });
  return {
    authState,
    syncSpies,
    getEntryIds,
    getPendingCount,
    uploadPendingMutations,
    getEntry,
    getClass,
  };
});

const order: string[] = [];
const { authState, syncSpies, getEntryIds, getPendingCount, uploadPendingMutations } = hoisted;

vi.mock('@/services/replication/classEnrichmentCache', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/replication/classEnrichmentCache')>()),
  invalidateClassEnrichment: () => order.push('invalidate'),
}));

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
    clearCache: vi.fn(),
    getAllLocalIds: hoisted.getEntryIds,
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

vi.mock('@/services/replication/ReplicatedPaperworkPrintsTable', () => ({
  replicatedPaperworkPrintsTable: {
    setMutationManager: vi.fn(),
    sync: hoisted.syncSpies.paperwork_prints,
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
function renderProvider() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
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
        <ReplicationSyncProvider autoSync syncOnReconnect={false}>
          <div />
        </ReplicationSyncProvider>
      </NetworkStatusTestProvider>
    </QueryClientProvider>
  );
}

function fakeSession(): Session {
  return { access_token: 'tok', user: { id: 'u1' } } as unknown as Session;
}

const settle = () => act(async () => {});
const nudge = (targets: Array<{ name: string; scopeId: string }>) =>
  window.dispatchEvent(new CustomEvent('replication:sync-requested', { detail: { targets } }));

// MYK9-1304: realtime nudges sync only what changed, and never in parallel.
describe('ReplicationSyncProvider: scoped realtime nudges', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(2_000_000);
    authState.callback = null;
    getEntryIds.mockReset();
    getEntryIds.mockResolvedValue(new Set());
    getPendingCount.mockReset();
    getPendingCount.mockResolvedValue(0);
    uploadPendingMutations.mockReset();
    uploadPendingMutations.mockResolvedValue([]);
    window.localStorage.clear();
    for (const spy of Object.values(syncSpies)) {
      spy.mockReset();
      spy.mockResolvedValue({ success: true, rowsAffected: 0 });
    }
    renderProvider();
    await act(async () => {
      authState.callback?.('INITIAL_SESSION', fakeSession());
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    for (const spy of Object.values(syncSpies)) spy.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('one entries nudge syncs only entries for that show, never the other tables', async () => {
    await act(async () => {
      nudge([{ name: 'entries', scopeId: 'show-1' }]);
    });
    await settle();

    expect(syncSpies.entries.mock.calls.map(call => call[0])).toEqual(['show-1']);
    for (const [name, spy] of Object.entries(syncSpies))
      if (name !== 'entries') expect(spy).not.toHaveBeenCalled();
  });

  it('a paperwork_prints nudge syncs that table scoped by show id', async () => {
    await act(async () => {
      nudge([{ name: 'paperwork_prints', scopeId: 'show-1' }]);
    });
    await settle();

    expect(syncSpies.paperwork_prints.mock.calls.map(call => call[0])).toEqual(['show-1']);
    expect(syncSpies.entries).not.toHaveBeenCalled();
  });

  it('nudges during an in-flight pass run one follow-up pass with the union, never in parallel', async () => {
    let releaseEntries: () => void = () => {};
    syncSpies.entries.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          releaseEntries = () => resolve({ success: true, rowsAffected: 0 });
        })
    );
    await act(async () => {
      nudge([{ name: 'entries', scopeId: 'show-1' }]);
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(syncSpies.entries).toHaveBeenCalledTimes(1);

    await act(async () => {
      nudge([{ name: 'classes', scopeId: 'trial-1' }]);
      nudge([
        { name: 'classes', scopeId: 'trial-1' },
        { name: 'paperwork_prints', scopeId: 'show-1' },
      ]);
      await vi.advanceTimersByTimeAsync(10);
    });
    // Marked dirty, not started: nothing ran alongside the in-flight pass.
    expect(syncSpies.classes).not.toHaveBeenCalled();
    expect(syncSpies.paperwork_prints).not.toHaveBeenCalled();

    await act(async () => {
      releaseEntries();
      await vi.advanceTimersByTimeAsync(10);
    });
    await settle();

    expect(syncSpies.entries).toHaveBeenCalledTimes(1);
    expect(syncSpies.classes.mock.calls.map(call => call[0])).toEqual(['trial-1']);
    expect(syncSpies.paperwork_prints.mock.calls.map(call => call[0])).toEqual(['show-1']);
  });

  // MYK9-1327: a sync that ran while the pick was queued refilled the judge-name cache with the
  // old judge. The cache must be dropped BEFORE the post-upload class pull reads it.
  it('drops the judge-name cache before the post-upload sync when a set_class_judge uploaded', async () => {
    order.length = 0;
    syncSpies.classes.mockImplementation(async () => {
      order.push('sync');
      return { success: true, rowsAffected: 0 };
    });
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('replication:upload-complete', {
          detail: {
            tables: ['classes'],
            count: 1,
            mutations: [
              {
                tableName: 'classes',
                rowId: 'class-1',
                operation: 'UPDATE',
                rpcName: 'set_class_judge',
              },
            ],
          },
        })
      );
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await settle();

    expect(order).toContain('sync');
    expect(order[0]).toBe('invalidate');
  });

  it('leaves the judge-name cache alone for an upload without a set_class_judge', async () => {
    order.length = 0;
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('replication:upload-complete', {
          detail: {
            tables: ['classes'],
            count: 1,
            mutations: [{ tableName: 'classes', rowId: 'class-1', operation: 'UPDATE' }],
          },
        })
      );
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await settle();

    expect(order).not.toContain('invalidate');
  });
});
