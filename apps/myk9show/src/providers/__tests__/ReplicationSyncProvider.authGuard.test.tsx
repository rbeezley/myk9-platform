import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AuthChangeEvent, Session, Subscription } from '@supabase/supabase-js';
import { NetworkStatusContext } from '@/hooks/useNetworkStatus';
import { notifications } from '@/lib/notifications';

type AuthCallback = (event: AuthChangeEvent, session: Session | null) => void;

const hoisted = vi.hoisted(() => {
  const authState: { callback: AuthCallback | null } = { callback: null };
  const unsubscribeSpy = vi.fn();
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
  const clearEntriesCache = vi.fn().mockResolvedValue(undefined);
  const getEntryIds = vi.fn().mockResolvedValue(new Set(['cached-entry']));
  const getPendingCount = vi.fn().mockResolvedValue(0);
  const uploadPendingMutations = vi.fn().mockResolvedValue([]);
  const getEntry = vi.fn().mockResolvedValue({ showId: 'show-1', classId: 'class-1' });
  const getClass = vi.fn().mockResolvedValue({ trialId: 'trial-1' });
  return {
    authState,
    unsubscribeSpy,
    syncSpies,
    clearEntriesCache,
    getEntryIds,
    getPendingCount,
    uploadPendingMutations,
    getEntry,
    getClass,
  };
});

const {
  authState,
  unsubscribeSpy,
  syncSpies,
  clearEntriesCache,
  getEntryIds,
  getPendingCount,
  uploadPendingMutations,
} = hoisted;

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
    clearCache: hoisted.clearEntriesCache,
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
            subscription: { unsubscribe: hoisted.unsubscribeSpy } as unknown as Subscription,
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
      uploadPendingMutations = hoisted.uploadPendingMutations;
      getPendingCount = hoisted.getPendingCount;
      restoreMutationsFromLocalStorage = vi.fn().mockResolvedValue(undefined);
    } as unknown as typeof actual.MutationManager,
  };
});

import { ReplicationSyncProvider } from '../ReplicationSyncProvider';

function renderProvider(autoSync = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
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
        <ReplicationSyncProvider autoSync={autoSync} syncOnReconnect={false}>
          <div />
        </ReplicationSyncProvider>
      </NetworkStatusContext.Provider>
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

describe('ReplicationSyncProvider — auth guard', () => {
  beforeEach(() => {
    authState.callback = null;
    unsubscribeSpy.mockClear();
    clearEntriesCache.mockClear();
    getEntryIds.mockReset();
    getEntryIds.mockResolvedValue(new Set(['cached-entry']));
    getPendingCount.mockReset();
    getPendingCount.mockResolvedValue(0);
    uploadPendingMutations.mockReset();
    uploadPendingMutations.mockResolvedValue([]);
    window.localStorage.clear();
    for (const spy of Object.values(syncSpies)) spy.mockClear();
  });

  it('refreshes only the affected show entries and trial classes after a ringside upload', async () => {
    renderProvider(false);
    await act(async () => {
      authState.callback?.('INITIAL_SESSION', fakeSession());
    });
    for (const spy of Object.values(syncSpies)) spy.mockClear();

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
    });

    expect(syncSpies.entries).toHaveBeenCalledWith('show-1');
    expect(syncSpies.classes).toHaveBeenCalledWith('trial-1');
    expect(syncSpies.shows).not.toHaveBeenCalled();
    expect(syncSpies.dogs).not.toHaveBeenCalled();
    expect(syncSpies.clubs).not.toHaveBeenCalled();
    expect(syncSpies.waitlist_entries).not.toHaveBeenCalled();
  });

  it('coalesces uploads during a download into one subsequent scoped refresh', async () => {
    renderProvider(false);
    await act(async () => {
      authState.callback?.('INITIAL_SESSION', fakeSession());
    });
    let finish!: () => void;
    syncSpies.entries.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = () => resolve({ success: true, rowsAffected: 0 });
        })
    );
    await act(async () => {
      dispatchRingsideUpload();
    });
    await act(async () => {
      dispatchRingsideUpload();
      dispatchRingsideUpload();
    });
    expect(syncSpies.entries).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
    });
    expect(syncSpies.entries).toHaveBeenCalledTimes(2);
    expect(syncSpies.entries).toHaveBeenLastCalledWith('show-1');
    expect(syncSpies.classes).toHaveBeenCalledTimes(2);
    expect(syncSpies.shows).not.toHaveBeenCalled();
  });

  it('retains a full refresh requested during a scoped download', async () => {
    renderProvider(false);
    await act(async () => {
      authState.callback?.('INITIAL_SESSION', fakeSession());
    });
    let finish!: () => void;
    syncSpies.entries.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = () => resolve({ success: true, rowsAffected: 0 });
        })
    );
    await act(async () => {
      dispatchRingsideUpload();
    });
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('replication:upload-complete', {
          detail: { tables: ['dogs'], count: 1 },
        })
      );
    });
    expect(syncSpies.shows).not.toHaveBeenCalled();
    await act(async () => {
      finish();
    });
    expect(syncSpies.shows).toHaveBeenCalledTimes(1);
    expect(syncSpies.dogs).toHaveBeenCalledTimes(1);
  });

  it('does not download after logout while local scope discovery is pending', async () => {
    renderProvider(false);
    await act(async () => {
      authState.callback?.('INITIAL_SESSION', fakeSession());
    });
    let finish!: () => void;
    hoisted.getEntry.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = () => resolve({ showId: 'show-1', classId: 'class-1' });
        })
    );
    await act(async () => {
      dispatchRingsideUpload();
    });
    await act(async () => {
      authState.callback?.('SIGNED_OUT', null);
    });
    await act(async () => {
      finish();
    });
    expect(syncSpies.entries).not.toHaveBeenCalled();
    expect(syncSpies.classes).not.toHaveBeenCalled();
  });

  it('does not sync any table while there is no session', async () => {
    renderProvider();

    await act(async () => {
      authState.callback?.('INITIAL_SESSION', null);
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    for (const spy of Object.values(syncSpies)) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it('fires sync once when the session becomes available', async () => {
    renderProvider();

    // Flush the cold-load "initial sync" effect's setTimeout(0) FIRST, while
    // still unauthenticated — triggerSync early-returns on no session, so this
    // path no-ops. Draining it now removes a second sync source that otherwise
    // races the session-trigger below and makes the call count order-dependent
    // (1 vs 2) under --sequence.shuffle.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Now deliver the session: the "session became available" effect fires the
    // single sync this test asserts on.
    await act(async () => {
      authState.callback?.('INITIAL_SESSION', fakeSession());
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(syncSpies.shows).toHaveBeenCalledTimes(1);
    expect(syncSpies.clubs).toHaveBeenCalledTimes(1);
    expect(uploadPendingMutations).toHaveBeenCalledTimes(1);
  });

  it('refreshes the entries cache before the first authenticated sync for the result-view version', async () => {
    renderProvider();

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    await act(async () => {
      authState.callback?.('INITIAL_SESSION', fakeSession());
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(clearEntriesCache).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('myk9:entry-result-replica-version')).toBe(
      '20260620-authenticated-entry-results-view-v2'
    );
    expect(syncSpies.entries).toHaveBeenCalledTimes(1);
  });

  it('does not clear an already-empty entry replica during the result-view version check', async () => {
    getEntryIds.mockResolvedValueOnce(new Set());
    renderProvider();

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    await act(async () => {
      authState.callback?.('INITIAL_SESSION', fakeSession());
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(clearEntriesCache).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('myk9:entry-result-replica-version')).toBe(
      '20260620-authenticated-entry-results-view-v2'
    );
  });

  it('defers the entries cache refresh while offline mutations are still pending', async () => {
    getPendingCount.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    renderProvider();

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    await act(async () => {
      authState.callback?.('INITIAL_SESSION', fakeSession());
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(clearEntriesCache).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('myk9:entry-result-replica-version')).toBeNull();
    expect(syncSpies.entries).toHaveBeenCalledTimes(1);
  });

  it('does not fire sync on session change when autoSync is false', async () => {
    renderProvider(false);

    await act(async () => {
      authState.callback?.('SIGNED_IN', fakeSession());
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    for (const spy of Object.values(syncSpies)) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it('does not show a failure toast for aborted background download syncs', async () => {
    syncSpies.shows.mockRejectedValueOnce(
      new Error('Supabase query failed: AbortError: signal is aborted without reason')
    );

    renderProvider();

    await act(async () => {
      authState.callback?.('INITIAL_SESSION', fakeSession());
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(notifications.error).not.toHaveBeenCalled();
  });

  it('unsubscribes from auth state changes on unmount', () => {
    const { unmount } = renderProvider();
    unmount();
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });
});
