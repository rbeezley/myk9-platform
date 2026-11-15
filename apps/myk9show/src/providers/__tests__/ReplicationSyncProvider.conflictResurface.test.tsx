import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AuthChangeEvent, Session, Subscription } from '@supabase/supabase-js';
import { Toaster, toast } from 'sonner';
import { CONFLICT_TOAST_TITLE } from '@/lib/offlineCopy';
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

const { authState, unsubscribeSpy, conflictSpies, flagEnabled } = hoisted;

// ── module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/notifications', () => ({
  notifications: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

// The real toaster, with spies on the two calls the provider makes, so a test can count the
// notices a person would actually see.
vi.mock('sonner', async importOriginal => {
  const actual = await importOriginal<typeof import('sonner')>();
  return {
    ...actual,
    toast: Object.assign(vi.fn(actual.toast), {
      ...actual.toast,
      warning: vi.fn(actual.toast.warning),
      dismiss: vi.fn(actual.toast.dismiss),
    }),
  };
});

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

vi.mock('@/services/database/supabaseClient', async () => ({
  supabase: {
    auth: {
      ...(await import('@/test/mocks/providerAuthSession')).providerAuthSessionStub,
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

function renderProvider() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <NetworkStatusTestProvider
        value={{
          isOnline: true,
          quality: null,
        }}
      >
        <ReplicationSyncProvider autoSync={false} syncOnReconnect={false}>
          <div />
        </ReplicationSyncProvider>
      </NetworkStatusTestProvider>
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

    // 11 tables × 1 conflict each = 11 events
    expect(dispatched).toHaveLength(11);
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
    // First table (shows) throws — the other 10 should still dispatch their conflicts.
    conflictSpies.shows.mockRejectedValue(new Error('IDB transaction error'));

    const dispatched: CustomEvent[] = [];
    vi.spyOn(window, 'dispatchEvent').mockImplementation(e => {
      if (e instanceof CustomEvent && e.type === 'replication:conflict') dispatched.push(e);
      return true;
    });

    renderProvider();
    await triggerAuth(fakeSession());

    // shows threw → 10 remaining tables × 1 conflict each = 10 events
    expect(dispatched).toHaveLength(10);
    // None of the dispatched events should be for the failing table
    for (const e of dispatched) {
      expect(e.detail.tableName).not.toBe('shows');
    }

    vi.restoreAllMocks();
  });
});

describe('ReplicationSyncProvider: the conflict notice (MYK9-1995)', () => {
  beforeEach(async () => {
    // Own setup: the order of tests is shuffled in CI, so nothing may lean on another test's reset.
    const { toast: actualToast } = await vi.importActual<typeof import('sonner')>('sonner');
    vi.mocked(toast.warning).mockReset().mockImplementation(actualToast.warning);
    vi.mocked(toast.dismiss).mockReset().mockImplementation(actualToast.dismiss);
    authState.callback = null;
    flagEnabled.mockReturnValue(true);
    for (const [tableName, spy] of Object.entries(conflictSpies)) {
      spy.mockReset();
      spy.mockResolvedValue([makeConflictSnapshot(tableName)]);
    }
  });

  it('shows one notice per conflict when the live conflict and the sign-in replay both fire', async () => {
    renderProvider();
    render(<Toaster />);
    // The sync raises the conflict on reconnect; the sign-in replays every persisted one. The
    // replay carries the same classes/row-1 conflict the sync just raised.
    const detail = makeConflictSnapshot('classes');
    await act(async () => {
      window.dispatchEvent(new CustomEvent('replication:conflict', { detail }));
    });
    await triggerAuth(fakeSession());
    await waitFor(() =>
      expect(screen.getAllByText(CONFLICT_TOAST_TITLE).length).toBeGreaterThan(0)
    );
    const forClasses = vi
      .mocked(toast.warning)
      .mock.calls.filter(([, options]) => options?.id === 'conflict:classes:row-1');
    expect(forClasses.length).toBeGreaterThanOrEqual(2);
    // 11 tables replay one conflict each, plus the live one on classes which the replay repeats:
    // 11 notices, never 12. A dog's notice names the dog instead of using the shared title
    // (MYK9-2010), so the other 10 tables carry the shared one.
    expect(screen.getAllByText(CONFLICT_TOAST_TITLE)).toHaveLength(10);
    expect(screen.getByText(/^A dog was changed on two devices$/)).toBeInTheDocument();
  });

  it('tells the header a choice was saved, after the resolve lands', async () => {
    renderProvider();
    const settled = vi.fn();
    window.addEventListener('replication:conflict-settled', settled);
    try {
      await act(async () => {
        window.dispatchEvent(
          new CustomEvent('replication:conflict', { detail: makeConflictSnapshot('unknown') })
        );
      });
      const options = vi.mocked(toast.warning).mock.calls.at(-1)?.[1];
      await act(async () => {
        const cancel = options?.cancel;
        if (cancel && typeof cancel === 'object' && 'onClick' in cancel) {
          cancel.onClick({} as never);
        }
      });
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      expect(settled).toHaveBeenCalledTimes(1);
      expect(toast.dismiss).toHaveBeenCalledWith('conflict:unknown:row-1');
    } finally {
      window.removeEventListener('replication:conflict-settled', settled);
    }
  });
});
