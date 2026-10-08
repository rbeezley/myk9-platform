import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

const queryClientRef: { current: QueryClient | null } = { current: null };

function renderProvider() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClientRef.current = queryClient;
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
          <div />
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
  let invalidateSpy: ReturnType<typeof vi.spyOn>;

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
    invalidateSpy = vi.spyOn(queryClientRef.current!, 'invalidateQueries');
    await act(async () => {
      authState.callback?.('INITIAL_SESSION', fakeSession());
    });
    // Let every startup pass (initial, auth, pending-upload flush) finish, then
    // advance past the spacing window so each test starts from a quiet tab.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(fullPassCount()).toBeGreaterThan(0);
    invalidateSpy.mockClear();
    for (const spy of Object.values(syncSpies)) spy.mockClear();
  });

  afterEach(() => {
    setVisibility('visible');
    vi.useRealTimers();
  });

  it('a pass in which no rows changed invalidates no queries', async () => {
    await act(async () => {
      window.dispatchEvent(new Event('replication:sync-requested'));
    });
    await settle();

    expect(fullPassCount()).toBe(1);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('invalidates only the tables whose rows changed', async () => {
    syncSpies.entries.mockResolvedValue({ success: true, rowsAffected: 2 });

    await act(async () => {
      window.dispatchEvent(new Event('replication:sync-requested'));
    });
    await settle();

    const keys = invalidateSpy.mock.calls.map(
      ([filters]: [{ queryKey: string[] }]) => filters.queryKey
    );
    expect(keys).toContainEqual(['entries']);
    expect(keys).not.toContainEqual(['shows']);
    expect(keys).not.toContainEqual(['dogs']);
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
});
