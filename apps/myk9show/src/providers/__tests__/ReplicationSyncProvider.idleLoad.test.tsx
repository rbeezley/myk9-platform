import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useContext, useEffect } from 'react';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import type { AuthChangeEvent, Session, Subscription } from '@supabase/supabase-js';
import { NetworkStatusContext } from '@/hooks/useNetworkStatus';

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
    dog_registrations: makeSyncSpy(),
    people: makeSyncSpy(),
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
// Both sync for real since MYK9-1071, so they are stubbed like their siblings.
vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: {
    setMutationManager: vi.fn(),
    sync: hoisted.syncSpies.dog_registrations,
  },
}));
vi.mock('@/services/replication/ReplicatedShowDeskPeopleTable', () => ({
  replicatedShowDeskPeopleTable: { setMutationManager: vi.fn(), sync: hoisted.syncSpies.people },
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
import {
  ReplicationSyncContext,
  type ReplicationSyncContextValue,
} from '@/context/ReplicationSyncContext';

let latestContext: ReplicationSyncContextValue | null = null;
let providerQueryClient: QueryClient | null = null;

function ContextProbe() {
  const value = useContext(ReplicationSyncContext);
  useEffect(() => {
    latestContext = value;
  });
  return null;
}

function renderProvider() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  providerQueryClient = queryClient;
  return render(
    <QueryClientProvider client={queryClient}>
      <NetworkStatusContext.Provider
        value={{
          isOnline: true,
          quality: null,
          showOfflineMessage: false,
          retryConnection: vi.fn(),
        }}
      >
        <ReplicationSyncProvider autoSync syncOnReconnect={false}>
          <ContextProbe />
        </ReplicationSyncProvider>
      </NetworkStatusContext.Provider>
    </QueryClientProvider>
  );
}

function fakeSession(): Session {
  return { access_token: 'tok', user: { id: 'u1' } } as unknown as Session;
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

const fullPassCount = () => syncSpies.shows.mock.calls.length;
const settle = () => act(async () => {});

// MYK9-1054: an idle signed-in tab must cost almost nothing.
describe('ReplicationSyncProvider: idle load', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(2_000_000);
    setVisibility('visible');
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
    // Let every startup pass (initial, auth, pending-upload flush) finish, then
    // advance past the spacing window so each test starts from a quiet tab.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(fullPassCount()).toBeGreaterThan(0);
    for (const spy of Object.values(syncSpies)) spy.mockClear();
  });

  afterEach(() => {
    setVisibility('visible');
    vi.useRealTimers();
  });

  it('spaces polls and visibility catch-ups at least 15s apart', async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fullPassCount()).toBe(1);

    // Becoming visible 5s after that poll must not start a second pass yet.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(fullPassCount()).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fullPassCount()).toBe(2);
  });

  it('does not poll while the tab is hidden, and catches up once when it is visible', async () => {
    setVisibility('hidden');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });
    expect(fullPassCount()).toBe(0);

    setVisibility('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await settle();
    expect(fullPassCount()).toBe(1);
  });

  it('a deferred (re-SUBSCRIBED) request does not start a pass at once but is not dropped', async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(fullPassCount()).toBe(0);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('replication:sync-requested', { detail: { deferred: true } })
      );
    });
    expect(fullPassCount()).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(fullPassCount()).toBe(1);
  });

  it('scoped ringside passes every 5s do not postpone the full poll', async () => {
    for (let i = 0; i < 36; i++) {
      await act(async () => {
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
        await vi.advanceTimersByTimeAsync(5_000);
      });
    }
    // 3 minutes: at least one full pass per 60s poll interval.
    expect(fullPassCount()).toBeGreaterThanOrEqual(3);
  });

  it('an explicit request still runs promptly right after a pass', async () => {
    await act(async () => {
      window.dispatchEvent(new Event('replication:sync-requested'));
    });
    await settle();
    await act(async () => {
      window.dispatchEvent(new Event('replication:sync-requested'));
    });
    await settle();
    expect(fullPassCount()).toBe(2);
  });

  // MYK9-1064: a staff open asks for a scoped entries pass through the context.
  describe('triggerSync with a scoped entries target', () => {
    const TARGET = [{ name: 'entries' as const, scopeId: 'show-9' }];

    it('syncs only that show, advances the status and invalidates entries', async () => {
      const invalidate = vi.spyOn(providerQueryClient!, 'invalidateQueries');
      const before = latestContext!.status.lastSyncAt;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
        await latestContext!.triggerSync(TARGET);
      });

      expect(syncSpies.entries.mock.calls).toEqual([['show-9']]);
      expect(fullPassCount()).toBe(0);
      expect(latestContext!.status.tablesStatus.entries).toBe('success');
      expect(latestContext!.status.lastSyncAt?.getTime()).toBeGreaterThan(before?.getTime() ?? 0);
      expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['entries'] }));
    });

    // The staff query for the show, mounted the way the class page mounts it.
    function mountShowEntries(queryFn: () => Promise<string[]>) {
      const observer = new QueryObserver(providerQueryClient!, {
        queryKey: queryKeys.showEntries('show-9'),
        queryFn,
        retry: false,
      });
      const unsubscribe = observer.subscribe(() => undefined);
      return { observer, unsubscribe };
    }

    it('refetches the show entries query after the pass, with no hook mounted', async () => {
      const queryFn = vi.fn().mockResolvedValue(['row']);
      const { unsubscribe } = mountShowEntries(queryFn);
      await settle();
      expect(queryFn).toHaveBeenCalledTimes(1);

      await act(async () => {
        await latestContext!.triggerSync(TARGET);
      });
      await settle();

      expect(queryFn).toHaveBeenCalledTimes(2);
      unsubscribe();
    });

    it('a first fetch still in flight ends with the post-sync read', async () => {
      let finishFirst: (rows: string[]) => void = () => {};
      const queryFn = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<string[]>(resolve => {
              finishFirst = resolve;
            })
        )
        .mockResolvedValue(['fresh']);
      const { observer, unsubscribe } = mountShowEntries(queryFn);

      await act(async () => {
        await latestContext!.triggerSync(TARGET);
      });
      await act(async () => {
        finishFirst(['stale']);
      });
      await settle();

      expect(observer.getCurrentResult().data).toEqual(['fresh']);
      unsubscribe();
    });

    it('refetches after a queued pass runs, even though no hook is waiting', async () => {
      // Reads "post-sync" only once the show's entries pass has run.
      const queryFn = vi.fn(async () =>
        syncSpies.entries.mock.calls.some(call => call[0] === 'show-9') ? ['post'] : ['pre']
      );
      const { observer, unsubscribe } = mountShowEntries(queryFn);
      await settle();
      let releaseShows: () => void = () => {};
      syncSpies.shows.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            releaseShows = () => resolve({ success: true, rowsAffected: 0 });
          })
      );
      let full: Promise<void> = Promise.resolve();
      await act(async () => {
        full = latestContext!.triggerSync();
        await Promise.resolve();
      });
      await act(async () => {
        await latestContext!.triggerSync(TARGET);
      });

      await act(async () => {
        releaseShows();
        await full;
      });
      await settle();

      expect(observer.getCurrentResult().data).toEqual(['post']);
      unsubscribe();
    });

    it('a failed entries sync refetches nothing', async () => {
      syncSpies.entries.mockResolvedValueOnce({ success: false, error: 'boom' });
      const queryFn = vi.fn().mockResolvedValue(['row']);
      const { unsubscribe } = mountShowEntries(queryFn);
      await settle();

      await act(async () => {
        await latestContext!.triggerSync(TARGET);
      });
      await settle();

      expect(queryFn).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('does not move the full-pass spacing clock', async () => {
      await act(async () => {
        await latestContext!.triggerSync(TARGET);
        await vi.advanceTimersByTimeAsync(60_000);
      });

      expect(fullPassCount()).toBe(1);
    });

    it('queues behind a full pass in flight and still runs afterwards', async () => {
      let releaseShows: () => void = () => {};
      syncSpies.shows.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            releaseShows = () => resolve({ success: true, rowsAffected: 0 });
          })
      );
      let full: Promise<void> = Promise.resolve();
      await act(async () => {
        full = latestContext!.triggerSync();
        await Promise.resolve();
      });
      await act(async () => {
        await latestContext!.triggerSync(TARGET);
      });
      expect(syncSpies.entries.mock.calls.some(call => call[0] === 'show-9')).toBe(false);

      await act(async () => {
        releaseShows();
        await full;
      });
      await settle();

      expect(syncSpies.entries.mock.calls.some(call => call[0] === 'show-9')).toBe(true);
    });
  });
});
