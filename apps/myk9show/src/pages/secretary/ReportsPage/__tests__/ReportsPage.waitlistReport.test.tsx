/**
 * MYK9-717: the Waitlist Report, rendered on the real Reports page against the
 * REAL replicated tables (fake-indexeddb) and the real read services.
 *
 * Waitlisted dogs live in `waitlist_entries`; `entries_entry_status_check` has
 * no waitlist status, so every `entries` row seeded here carries a real CHECK
 * value. The report used to filter `entries` for 'waitlist'/'waitlisted' and so
 * printed empty on every show.
 *
 * Run for a secretary and for a club admin. The client read path has no role
 * branch; what kept a club admin's waitlist empty was the SELECT policy
 * (MYK9-660, fixed in #2408). This pins that nothing on the client re-introduces
 * a difference.
 *
 * NOTE for shuffled runs: the replicated tables and React Query's
 * `onlineManager` are module-scope singletons, so every test resets both.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, onlineManager } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@/test/utils/testUtils';
import { createChainableQuery, mockSupabase, resetMockSupabase } from '@/test/mocks/supabase';
import {
  replicatedClassesTable,
  replicatedDogsTable,
  replicatedEntriesTable,
  replicatedShowsTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { replicatedWaitlistEntriesTable } from '@/services/replication/ReplicatedWaitlistEntriesTable';
import { resetHandlerHydrationCircuit } from '@/services/database/entries/handlerHydration';
import { NOTIFY_DEBOUNCE_MS } from '@myk9/replication';
import ReportsPage from '../index';

const SHOW_ID = 'show-1';
const TRIAL_ID = 'trial-1';

const show = vi.hoisted(() => ({
  id: 'show-1',
  name: 'Heartland Scent Work Classic',
  organization: 'AKC',
  trials: [{ id: 'trial-1', name: 'Trial 1', trialNumber: 1, date: '2026-10-10' }],
}));

vi.mock('@/hooks/useFastShowDetails', () => ({
  useFastShowDetails: () => ({ show, isLoading: false, isError: false, hasData: true }),
}));

vi.mock('@/features/show-map/cockpit/useShowPaperworkPrints', () => ({
  useShowPaperworkPrints: () => ({ data: [], isLoading: false, isError: false, syncFailed: false }),
}));

const WAITLIST_ROUTE = `/shows/${SHOW_ID}/reports?report=waitlist-report`;

const PEOPLE = [
  { id: 'handler-9', first_name: 'Jane', last_name: 'Mitchell' },
  { id: 'owner-2', first_name: 'Bob', last_name: 'Smith' },
];

function appLikeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
        networkMode: 'online',
        placeholderData: (previousData: unknown) => previousData,
      },
    },
  });
}

async function drainReplicaNotices(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, NOTIFY_DEBOUNCE_MS + 50));
}

async function resetReplication(): Promise<void> {
  const { databaseManager } = await import('@myk9/replication');
  await databaseManager.reset();
  await replicatedShowsTable.clearCache();
  await replicatedTrialsTable.clearCache();
  await replicatedClassesTable.clearCache();
  await replicatedEntriesTable.clearCache();
  await replicatedDogsTable.clearCache();
  await replicatedWaitlistEntriesTable.clearCache();
}

function klass(id: string, element: string, classOrder: number) {
  return {
    id,
    trialId: TRIAL_ID,
    element,
    level: 'Novice',
    section: '-',
    classStatus: 'setup',
    classOrder,
    maxEntries: 1,
  };
}

function waiting(id: string, classId: string, dogId: string, position: number, extra = {}) {
  return { id, classId, dogId, exhibitorId: 'exhib-1', position, status: 'waiting', ...extra };
}

type WaitlistReplica = 'waiting' | 'synced-empty' | 'never-synced';

/** A sold-out show: one confirmed dog, and a waitlist behind each class. */
async function seedShowWithWaitlist(waitlist: WaitlistReplica = 'waiting'): Promise<void> {
  await replicatedShowsTable.batchSet([
    { id: SHOW_ID, name: show.name, organization: 'AKC' },
  ] as never);
  await replicatedTrialsTable.batchSet([
    { id: TRIAL_ID, showId: SHOW_ID, name: 'Trial 1', trialNumber: 1, date: '2026-10-10' },
  ] as never);
  await replicatedClassesTable.batchSet([
    klass('class-int', 'Interior', 1),
    klass('class-con', 'Container', 2),
  ] as never);
  await replicatedDogsTable.batchSet([
    { id: 'dog-in', name: 'Entered', callName: 'Entered', breed: 'Beagle', ownerId: 'owner-2' },
    { id: 'dog-a', name: 'Aster', callName: 'Aster', breed: 'Beagle', ownerId: 'owner-2' },
    { id: 'dog-b', name: 'Bramble', callName: 'Bramble', breed: 'Vizsla', ownerId: 'owner-2' },
    { id: 'dog-c', name: 'Clover', callName: 'Clover', breed: 'Poodle', ownerId: 'owner-2' },
  ] as never);
  await replicatedEntriesTable.batchSet([
    {
      id: 'entry-1',
      showId: SHOW_ID,
      classId: 'class-int',
      dogId: 'dog-in',
      armband: '101',
      runOrder: 1,
      entryStatus: 'confirmed',
      checkInStatus: 'not-checked-in',
    },
  ] as never);
  await replicatedEntriesTable.updateSyncMetadata(
    { lastIncrementalSyncAt: Date.now(), totalRows: 1 },
    { scopeValue: SHOW_ID }
  );
  // Positions deliberately NOT in insertion order, and one offer already out:
  // the Waitlist tab no longer lists an offered row as waiting, so neither does
  // the report.
  if (waitlist === 'waiting') {
    await replicatedWaitlistEntriesTable.batchSet([
      waiting('wl-b', 'class-int', 'dog-b', 2),
      waiting('wl-a', 'class-int', 'dog-a', 1, { handlerId: 'handler-9' }),
      waiting('wl-c', 'class-con', 'dog-c', 1),
      waiting('wl-x', 'class-con', 'dog-a', 2, { status: 'offered' }),
    ] as never);
  }
  if (waitlist !== 'never-synced') {
    await replicatedWaitlistEntriesTable.updateSyncMetadata({
      lastIncrementalSyncAt: Date.now(),
      totalRows: waitlist === 'waiting' ? 4 : 0,
    });
  }
  await drainReplicaNotices();
}

let serverWaitingCount = 0;

function previewText(): string {
  const frame = screen.queryByTitle('Report Preview') as HTMLIFrameElement | null;
  return frame?.contentDocument?.body?.textContent ?? '';
}

describe.each([
  ['a secretary', 'secretary-1'],
  ['a club admin', 'club-admin-1'],
])('Waitlist Report for %s (MYK9-717)', (_role, userId) => {
  beforeEach(async () => {
    resetMockSupabase();
    resetHandlerHydrationCircuit();
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: userId, is_anonymous: false } } },
      error: null,
    } as never);
    serverWaitingCount = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'people') return createChainableQuery({ data: PEOPLE, error: null });
      // The empty-waitlist online verification: how many dogs the SERVER has waiting.
      if (table === 'waitlist_entries') {
        return createChainableQuery({ data: null, error: null, count: serverWaitingCount });
      }
      return createChainableQuery({ data: [], error: null });
    });
    onlineManager.setOnline(true);
    await resetReplication();
    await drainReplicaNotices();
    vi.spyOn(replicatedEntriesTable, 'sync').mockResolvedValue({ success: false } as never);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    onlineManager.setOnline(true);
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('prints each class waitlist from waitlist_entries, in position order, with handlers', async () => {
    await seedShowWithWaitlist();

    render(<ReportsPage />, { initialRoute: WAITLIST_ROUTE, queryClient: appLikeClient() });

    await waitFor(() => expect(previewText()).toContain('Bramble'), { timeout: 5000 });
    const text = previewText();

    expect(text).not.toMatch(/No dogs are on a waitlist|No waitlisted entries/);
    // Interior: Aster (1, named handler) before Bramble (2, falls back to owner).
    expect(text).toMatch(/Interior Novice.*1\s*Aster\s*Jane Mitchell.*2\s*Bramble\s*Bob Smith/s);
    // Container: only the dog still waiting.
    expect(text).toMatch(/Container Novice.*1\s*Clover\s*Bob Smith/s);
    // The confirmed entry is not on the waitlist.
    expect(text).not.toContain('Entered');
  });

  it('prints the waitlist from the synced replica with no connection', async () => {
    await seedShowWithWaitlist();
    onlineManager.setOnline(false);
    mockSupabase.from.mockImplementation(() =>
      createChainableQuery({ data: null, error: { message: 'TypeError: Failed to fetch' } })
    );

    render(<ReportsPage />, { initialRoute: WAITLIST_ROUTE, queryClient: appLikeClient() });

    await waitFor(() => expect(previewText()).toContain('Bramble'), { timeout: 5000 });
    expect(previewText()).toMatch(/Interior Novice.*1\s*Aster.*2\s*Bramble/s);
  });

  it('will not print "nobody is waiting" offline, where it cannot be checked', async () => {
    await seedShowWithWaitlist('synced-empty');
    onlineManager.setOnline(false);
    mockSupabase.from.mockImplementation(() =>
      createChainableQuery({ data: null, error: { message: 'TypeError: Failed to fetch' } })
    );

    render(<ReportsPage />, { initialRoute: WAITLIST_ROUTE, queryClient: appLikeClient() });

    expect(
      await screen.findByText(/could not load the report data/i, {}, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(previewText()).not.toContain('No dogs are on a waitlist');
  });

  it('says so when nobody is waiting, and re-reads when the waitlist replica changes', async () => {
    await seedShowWithWaitlist('synced-empty');

    render(<ReportsPage />, { initialRoute: WAITLIST_ROUTE, queryClient: appLikeClient() });

    await waitFor(() => expect(previewText()).toContain('No dogs are on a waitlist'), {
      timeout: 5000,
    });

    await act(async () => {
      await replicatedWaitlistEntriesTable.batchSet([
        waiting('wl-a', 'class-int', 'dog-a', 1),
      ] as never);
    });
    await waitFor(() => expect(previewText()).toContain('Aster'), { timeout: 5000 });
  });

  it('shows an error, not an empty waitlist, when the waitlist has never synced here', async () => {
    await seedShowWithWaitlist('never-synced');
    serverWaitingCount = 3;

    render(<ReportsPage />, { initialRoute: WAITLIST_ROUTE, queryClient: appLikeClient() });

    expect(
      await screen.findByText(/could not load the report data/i, {}, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(previewText()).not.toContain('No dogs are on a waitlist');
  });
});
