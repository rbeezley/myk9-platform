import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AuthChangeEvent, Session, Subscription } from '@supabase/supabase-js';
import { NetworkStatusTestProvider } from '@/test/utils/NetworkStatusTestProvider';

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
    dog_registrations: makeConflictSpy('dog_registrations'),
    people: makeConflictSpy('people'),
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

const { authState, conflictSpies } = hoisted;

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
vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: {
    setMutationManager: vi.fn(),
    sync: vi.fn().mockResolvedValue({ success: true, rowsAffected: 0 }),
    getConflictedRows: hoisted.conflictSpies.dog_registrations,
    subscribe: () => () => undefined,
  },
}));
vi.mock('@/services/replication/ReplicatedShowDeskPeopleTable', () => ({
  replicatedShowDeskPeopleTable: {
    setMutationManager: vi.fn(),
    sync: vi.fn().mockResolvedValue({ success: true, rowsAffected: 0 }),
    getConflictedRows: hoisted.conflictSpies.people,
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

const adoptSpy = vi.hoisted(() => vi.fn<() => Promise<number>>());
vi.mock('@/services/replication/heldRingsideScores', () => ({
  adoptHeldRingsideScoresForLiveClaim: () => adoptSpy(),
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
      rowRefetchers = { register: () => () => undefined };
      uploadPendingMutations = vi.fn().mockResolvedValue([]);
      getPendingCount = vi.fn().mockResolvedValue(0);
      restoreMutationsFromLocalStorage = vi.fn().mockResolvedValue(undefined);
      updateMutationServerVersions = vi.fn().mockResolvedValue(undefined);
      // Empty by default so the failed-mutation resurface effect (a separate
      // effect from the conflict resurface under test) returns early instead of
      // throwing TypeError and logging a warning on every auth trigger. The
      // failed-mutation path itself is covered in the listener test file.
      getFailedMutations = vi.fn().mockResolvedValue([]);
      discardPendingMutationsForRow = vi.fn().mockResolvedValue(undefined);
    } as unknown as typeof actual.MutationManager,
  };
});

import { ReplicationSyncProvider } from '../ReplicationSyncProvider';

function fakeSession(): Session {
  return { access_token: 'tok', user: { id: 'u1' } } as unknown as Session;
}

function renderProvider(isOnline: boolean) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (online: boolean) => (
    <QueryClientProvider client={queryClient}>
      <NetworkStatusTestProvider
        value={{
          isOnline: online,
          quality: null,
          showOfflineMessage: false,
          retryConnection: vi.fn(),
        }}
      >
        <ReplicationSyncProvider autoSync={false} syncOnReconnect={false}>
          <div />
        </ReplicationSyncProvider>
      </NetworkStatusTestProvider>
    </QueryClientProvider>
  );
  const view = render(tree(isOnline));
  return { setOnline: (online: boolean) => view.rerender(tree(online)) };
}

async function triggerAuth(session: Session | null) {
  await act(async () => {
    authState.callback?.('INITIAL_SESSION', session);
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

describe('ReplicationSyncProvider: held passcode scores are adopted by an active online session (MYK9-1205)', () => {
  beforeEach(() => {
    authState.callback = null;
    adoptSpy.mockReset();
    adoptSpy.mockResolvedValue(0);
    for (const spy of Object.values(conflictSpies)) {
      spy.mockReset();
      spy.mockResolvedValue([]);
    }
  });

  it('tries on auth init (app start or reload) while online', async () => {
    renderProvider(true);
    expect(adoptSpy).not.toHaveBeenCalled();
    await triggerAuth(fakeSession());
    expect(adoptSpy).toHaveBeenCalledTimes(1);
  });

  it('does not try while signed out', async () => {
    renderProvider(true);
    await triggerAuth(null);
    expect(adoptSpy).not.toHaveBeenCalled();
  });

  it('does not try while offline, then tries on reconnect', async () => {
    const { setOnline } = renderProvider(false);
    await triggerAuth(fakeSession());
    expect(adoptSpy).not.toHaveBeenCalled();

    await act(async () => setOnline(true));
    expect(adoptSpy).toHaveBeenCalledTimes(1);
  });
});
