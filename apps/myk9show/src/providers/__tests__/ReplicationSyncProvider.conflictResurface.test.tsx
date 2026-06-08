import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AuthChangeEvent, Session, Subscription } from '@supabase/supabase-js';
import { NetworkStatusContext } from '@/hooks/useNetworkStatus';

// ── hoisted spies ────────────────────────────────────────────────────────────

const hoisted = vi.hoisted(() => {
  const authState: { callback: ((e: AuthChangeEvent, s: Session | null) => void) | null } = {
    callback: null,
  };
  const unsubscribeSpy = vi.fn();

  const makeConflictSpy = (tableName: string) =>
    vi.fn().mockResolvedValue([
      {
        tableName,
        rowId: 'row-1',
        fields: ['status'],
        localData: { id: 'row-1', status: 'checked-in' },
        remoteData: { id: 'row-1', status: 'absent' },
        baseData: { id: 'row-1', status: 'no-status' },
        baseVersion: 1,
        localVersion: 2,
        remoteServerVersion: 7,
        detectedAt: 0,
      },
    ]);

  const conflictSpies = {
    shows: makeConflictSpy('shows'),
    trials: makeConflictSpy('trials'),
    classes: makeConflictSpy('classes'),
    entries: makeConflictSpy('entries'),
    dogs: makeConflictSpy('dogs'),
    clubs: makeConflictSpy('clubs'),
    judge_assignments: makeConflictSpy('judge_assignments'),
    armbands: makeConflictSpy('armbands'),
    waitlist_entries: makeConflictSpy('waitlist_entries'),
  };

  // Kill-switch: default ON (true) so normal tests exercise the resurface path.
  // Override per-test with flagEnabled.mockReturnValue(false) to verify suppression.
  const flagEnabled = vi.fn().mockReturnValue(true);

  return { authState, unsubscribeSpy, conflictSpies, flagEnabled };
});

const { authState, unsubscribeSpy, conflictSpies, flagEnabled } = hoisted;

// ── module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/notifications', () => ({
  notifications: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/hooks/useStoreSubscriptions', () => ({
  useStoreSubscriptions: () => undefined,
}));

vi.mock('@/features/show-presence/conflictSurfacingFlag', () => ({
  showConflictSurfacingEnabled: hoisted.flagEnabled,
}));

vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: {
    setMutationManager: vi.fn(),
    sync: vi.fn().mockResolvedValue({ success: true, rowsAffected: 0 }),
    getConflictedRows: hoisted.conflictSpies.shows,
  },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: {
    setMutationManager: vi.fn(),
    sync: vi.fn().mockResolvedValue({ success: true, rowsAffected: 0 }),
    getConflictedRows: hoisted.conflictSpies.trials,
  },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: {
    setMutationManager: vi.fn(),
    sync: vi.fn().mockResolvedValue({ success: true, rowsAffected: 0 }),
    getConflictedRows: hoisted.conflictSpies.classes,
  },
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    setMutationManager: vi.fn(),
    sync: vi.fn().mockResolvedValue({ success: true, rowsAffected: 0 }),
    getConflictedRows: hoisted.conflictSpies.entries,
  },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: {
    setMutationManager: vi.fn(),
    sync: vi.fn().mockResolvedValue({ success: true, rowsAffected: 0 }),
    getConflictedRows: hoisted.conflictSpies.dogs,
  },
}));
vi.mock('@/services/replication/ReplicatedClubsTable', () => ({
  replicatedClubsTable: {
    setMutationManager: vi.fn(),
    sync: vi.fn().mockResolvedValue({ success: true, rowsAffected: 0 }),
    getConflictedRows: hoisted.conflictSpies.clubs,
  },
}));
vi.mock('@/services/replication/ReplicatedJudgeAssignmentsTable', () => ({
  replicatedJudgeAssignmentsTable: {
    setMutationManager: vi.fn(),
    sync: vi.fn().mockResolvedValue({ success: true, rowsAffected: 0 }),
    getConflictedRows: hoisted.conflictSpies.judge_assignments,
  },
}));
vi.mock('@/services/replication/ReplicatedArmbandsTable', () => ({
  replicatedArmbandsTable: {
    setMutationManager: vi.fn(),
    sync: vi.fn().mockResolvedValue({ success: true, rowsAffected: 0 }),
    getConflictedRows: hoisted.conflictSpies.armbands,
  },
}));
vi.mock('@/services/replication/ReplicatedWaitlistEntriesTable', () => ({
  replicatedWaitlistEntriesTable: {
    setMutationManager: vi.fn(),
    sync: vi.fn().mockResolvedValue({ success: true, rowsAffected: 0 }),
    getConflictedRows: hoisted.conflictSpies.waitlist_entries,
  },
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (e: AuthChangeEvent, s: Session | null) => void) => {
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
    // Explicit re-declaration so module-load call at ReplicationSyncProvider:106
    // resolves synchronously before the async spread finishes.
    configureConflictSurfacing: vi.fn(),
    MutationManager: class {
      uploadPendingMutations = vi.fn().mockResolvedValue([]);
      getPendingCount = vi.fn().mockResolvedValue(0);
      restoreMutationsFromLocalStorage = vi.fn().mockResolvedValue(undefined);
      updateMutationServerVersions = vi.fn().mockResolvedValue(undefined);
      discardPendingMutationsForRow = vi.fn().mockResolvedValue(undefined);
    } as unknown as typeof actual.MutationManager,
  };
});

import { ReplicationSyncProvider } from '../ReplicationSyncProvider';

function fakeSession(): Session {
  return { access_token: 'tok', user: { id: 'u1' } } as unknown as Session;
}

function renderProvider() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <NetworkStatusContext.Provider
        value={{ isOnline: true, quality: null, showOfflineMessage: false, retryConnection: vi.fn() }}
      >
        <ReplicationSyncProvider autoSync={false} syncOnReconnect={false}>
          <div />
        </ReplicationSyncProvider>
      </NetworkStatusContext.Provider>
    </QueryClientProvider>
  );
}

async function triggerAuth(session: Session | null) {
  await act(async () => {
    authState.callback?.('INITIAL_SESSION', session);
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

// ── helpers ──────────────────────────────────────────────────────────────────

function makeConflictSnapshot(tableName: string) {
  return {
    tableName,
    rowId: 'row-1',
    fields: ['status'],
    localData: { id: 'row-1', status: 'checked-in' },
    remoteData: { id: 'row-1', status: 'absent' },
    baseData: { id: 'row-1', status: 'no-status' },
    baseVersion: 1,
    localVersion: 2,
    remoteServerVersion: 7,
    detectedAt: 0,
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('ReplicationSyncProvider — mount-time conflict re-surface', () => {
  beforeEach(() => {
    authState.callback = null;
    unsubscribeSpy.mockClear();
    flagEnabled.mockReturnValue(true);
    // Reset each spy to its default (one conflict per table).
    // mockReset() first — previous tests may have overridden the resolved value.
    for (const [tableName, spy] of Object.entries(conflictSpies)) {
      spy.mockReset();
      spy.mockResolvedValue([makeConflictSnapshot(tableName)]);
    }
  });

  it('dispatches replication:conflict for every persisted conflict on auth', async () => {
    const dispatched: CustomEvent[] = [];
    const originalDispatch = window.dispatchEvent.bind(window);
    vi.spyOn(window, 'dispatchEvent').mockImplementation(e => {
      if (e instanceof CustomEvent && e.type === 'replication:conflict') {
        dispatched.push(e);
      }
      return originalDispatch(e);
    });

    renderProvider();
    await triggerAuth(fakeSession());

    // 9 tables × 1 conflict each = 9 events
    expect(dispatched).toHaveLength(9);
    expect(dispatched[0].detail).toMatchObject({
      rowId: 'row-1',
      fields: ['status'],
      remoteServerVersion: 7,
    });

    vi.restoreAllMocks();
  });

  it('does not dispatch conflict events when not authenticated', async () => {
    const dispatched: CustomEvent[] = [];
    vi.spyOn(window, 'dispatchEvent').mockImplementation(e => {
      if (e instanceof CustomEvent && e.type === 'replication:conflict') dispatched.push(e);
      return true;
    });

    renderProvider();
    await triggerAuth(null);

    expect(dispatched).toHaveLength(0);
    for (const spy of Object.values(conflictSpies)) {
      expect(spy).not.toHaveBeenCalled();
    }

    vi.restoreAllMocks();
  });

  it('does not dispatch events when tables have no conflicts', async () => {
    for (const spy of Object.values(conflictSpies)) {
      spy.mockResolvedValue([]);
    }

    const dispatched: CustomEvent[] = [];
    vi.spyOn(window, 'dispatchEvent').mockImplementation(e => {
      if (e instanceof CustomEvent && e.type === 'replication:conflict') dispatched.push(e);
      return true;
    });

    renderProvider();
    await triggerAuth(fakeSession());

    expect(dispatched).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it('does not dispatch events when the conflict surfacing flag is off', async () => {
    flagEnabled.mockReturnValue(false);

    const dispatched: CustomEvent[] = [];
    vi.spyOn(window, 'dispatchEvent').mockImplementation(e => {
      if (e instanceof CustomEvent && e.type === 'replication:conflict') dispatched.push(e);
      return true;
    });

    renderProvider();
    await triggerAuth(fakeSession());

    expect(dispatched).toHaveLength(0);
    for (const spy of Object.values(conflictSpies)) {
      expect(spy).not.toHaveBeenCalled();
    }

    vi.restoreAllMocks();
  });

  it('continues resurfacing remaining tables when one table throws', async () => {
    // First table (shows) throws — the other 8 should still dispatch their conflicts.
    conflictSpies.shows.mockRejectedValue(new Error('IDB transaction error'));

    const dispatched: CustomEvent[] = [];
    vi.spyOn(window, 'dispatchEvent').mockImplementation(e => {
      if (e instanceof CustomEvent && e.type === 'replication:conflict') dispatched.push(e);
      return true;
    });

    renderProvider();
    await triggerAuth(fakeSession());

    // shows threw → 8 remaining tables × 1 conflict each = 8 events
    expect(dispatched).toHaveLength(8);
    // None of the dispatched events should be for the failing table
    for (const e of dispatched) {
      expect(e.detail.tableName).not.toBe('shows');
    }

    vi.restoreAllMocks();
  });
});
