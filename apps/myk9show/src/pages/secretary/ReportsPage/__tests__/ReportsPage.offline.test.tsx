/**
 * MYK9-721: the Reports page, rendered for real, against the REAL replicated
 * tables (fake-indexeddb) and the REAL read services.
 *
 * `useReportData` and `ReportPreview` are deliberately NOT mocked. The failure
 * this file guards lives in the wiring between React Query's network mode, the
 * replica reads and the Print gate, and a stubbed `useReportData` cannot see
 * any of them disagree. Only the network edge is faked: the shared Supabase
 * client mock (offline = every PostgREST call fails) and the entries sync.
 *
 * NOTE for shuffled runs: the replicated tables and React Query's
 * `onlineManager` are module-scope singletons, so every test resets both.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, onlineManager } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { createChainableQuery, mockSupabase, resetMockSupabase } from '@/test/mocks/supabase';
import {
  replicatedClassesTable,
  replicatedDogsTable,
  replicatedEntriesTable,
  replicatedShowsTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { getReportById } from '@/lib/reports/reportRegistry';
import { toScoresheetModel } from '@/lib/reports/toScoresheetModel';
import type { ReportDataSet } from '@/lib/reports/types';
import { NOTIFY_DEBOUNCE_MS } from '@myk9/replication';
import ReportsPage from '../index';

const SHOW_ID = 'show-1';
const TRIAL_ID = 'trial-1';
const CLASS_ID = 'class-1';

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

// The test renderer mounts no <Toaster/>; assert on what the page asked for.
const toastSpy = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => {
  const toast = Object.assign((...args: unknown[]) => toastSpy(...args), {
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
    dismiss: vi.fn(),
    custom: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    promise: vi.fn(),
  });
  return { toast, Toaster: () => null };
});

const CHECK_IN_ROUTE = `/shows/${SHOW_ID}/reports?report=check-in-sheet&trialId=${TRIAL_ID}&classId=${CLASS_ID}`;
const SUPPLIES_ROUTE = `/shows/${SHOW_ID}/reports?report=judge-supply-checklist`;

const OFFLINE = { data: null, error: { message: 'TypeError: Failed to fetch' } };

function goOffline(): void {
  onlineManager.setOnline(false);
  mockSupabase.from.mockImplementation(() => createChainableQuery(OFFLINE));
  mockSupabase.rpc.mockImplementation(() => createChainableQuery(OFFLINE));
}

/** The app's own defaults, minus retries: what a secretary's tab actually runs. */
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

/**
 * A replica write notifies on the leading AND trailing edge of a debounce. Let
 * the trailing notices from resetting and seeding land BEFORE the page mounts,
 * or they reach its subscription and re-run a read the test did not ask for.
 */
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
}

/** A show whose trials, classes, dogs and entries have all synced to this device. */
async function seedSyncedReplica(): Promise<void> {
  await replicatedShowsTable.batchSet([
    { id: SHOW_ID, name: show.name, organization: 'AKC' },
  ] as never);
  await replicatedTrialsTable.batchSet([
    { id: TRIAL_ID, showId: SHOW_ID, name: 'Trial 1', trialNumber: 1, date: '2026-10-10' },
  ] as never);
  await replicatedClassesTable.batchSet([
    {
      id: CLASS_ID,
      trialId: TRIAL_ID,
      element: 'Interior',
      level: 'Novice',
      section: '-',
      classStatus: 'setup',
      classOrder: 1,
    },
  ] as never);
  await replicatedDogsTable.batchSet([
    { id: 'dog-a', name: 'Aster', callName: 'Aster', breed: 'Beagle' },
    { id: 'dog-b', name: 'Bramble', callName: 'Bramble', breed: 'Vizsla' },
    { id: 'dog-c', name: 'Clover', callName: 'Clover', breed: 'Poodle' },
  ] as never);
  // Armbands deliberately NOT in run order, so the sheet's order is the run order.
  await replicatedEntriesTable.batchSet([
    entry('entry-c', 'dog-c', '103', 3),
    entry('entry-a', 'dog-a', '101', 1),
    entry('entry-b', 'dog-b', '102', 2),
  ] as never);
  await replicatedEntriesTable.updateSyncMetadata(
    { lastIncrementalSyncAt: Date.now(), totalRows: 3 },
    { scopeValue: SHOW_ID }
  );
  await drainReplicaNotices();
}

function entry(id: string, dogId: string, armband: string, runOrder: number) {
  return {
    id,
    showId: SHOW_ID,
    classId: CLASS_ID,
    dogId,
    armband,
    runOrder,
    entryStatus: 'confirmed',
    checkInStatus: 'not-checked-in',
  };
}

/** Records the check-in model the preview printed, in the order it printed it. */
function captureCheckInSheet(): { callNames: () => string[] } {
  const report = getReportById('check-in-sheet')!;
  const original = report.buildPdf!;
  let lastDataset: { dataset: ReportDataSet; sortOrder: string } | null = null;
  report.buildPdf = (dataset, sortOrder) => {
    lastDataset = { dataset, sortOrder };
    return original(dataset, sortOrder);
  };
  restoreBuildPdf = () => {
    report.buildPdf = original;
  };
  return {
    callNames: () => {
      if (!lastDataset) return [];
      const model = toScoresheetModel(lastDataset.dataset, lastDataset.sortOrder);
      return model.pages
        .filter(page => page.kind === 'check-in')
        .flatMap(page => page.entries.map(row => row.callName));
    },
  };
}
let restoreBuildPdf: () => void = () => {};

function previewFrame(): HTMLIFrameElement {
  return screen.getByTitle('Report Preview') as HTMLIFrameElement;
}

async function clickPrint(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: /^print$/i }));
}

describe('ReportsPage offline readiness (MYK9-721)', () => {
  beforeEach(async () => {
    resetMockSupabase();
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'secretary-1', is_anonymous: false } } },
      error: null,
    } as never);
    toastSpy.mockClear();
    onlineManager.setOnline(true);
    await resetReplication();
    await drainReplicaNotices();
    // The sync is the network edge. Offline it fails; the read must not need it.
    vi.spyOn(replicatedEntriesTable, 'sync').mockResolvedValue({ success: false } as never);
  });

  afterEach(async () => {
    restoreBuildPdf();
    vi.restoreAllMocks();
    onlineManager.setOnline(true);
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('prints the run order from the synced replica on a cold offline load', async () => {
    await seedSyncedReplica();
    goOffline();
    const sheet = captureCheckInSheet();

    render(<ReportsPage />, { initialRoute: CHECK_IN_ROUTE, queryClient: appLikeClient() });

    await waitFor(() => expect(previewFrame().src).toMatch(/^blob:/), { timeout: 5000 });
    expect(sheet.callNames()).toEqual(['Aster', 'Bramble', 'Clover']);

    const print = vi.fn();
    Object.defineProperty(previewFrame().contentWindow!, 'print', { value: print });
    await clickPrint();

    expect(print).toHaveBeenCalledTimes(1);
    expect(toastSpy).not.toHaveBeenCalledWith(expect.stringMatching(/connection|loading/i));
  });

  it('keeps a report printable offline when its cached hosted data is paused on a refetch', async () => {
    await seedSyncedReplica();
    const client = appLikeClient();
    // Settled judge-supply rows from earlier in this session. On mount the
    // stale key refetches, and offline that online-only read PAUSES with the
    // rows still in place: a warm cache, not an unanswered question.
    client.setQueryData(
      ['judge-supply-checklist-report', SHOW_ID],
      [
        {
          id: 'supply-1',
          trial_id: TRIAL_ID,
          judge_name: 'Pat Judge',
          person_id: null,
          item_label: 'Odor kit',
          included: true,
          note: null,
          sort_order: 1,
          is_custom: false,
        },
      ]
    );
    goOffline();

    render(<ReportsPage />, { initialRoute: SUPPLIES_ROUTE, queryClient: client });

    await waitFor(
      () => expect(previewFrame().contentDocument?.body.textContent).toMatch(/Odor kit/),
      {
        timeout: 5000,
      }
    );
    expect(client.getQueryState(['judge-supply-checklist-report', SHOW_ID])?.fetchStatus).toBe(
      'paused'
    );

    const print = vi.fn();
    Object.defineProperty(previewFrame().contentWindow!, 'print', { value: print });
    await clickPrint();

    expect(print).toHaveBeenCalledTimes(1);
  });

  it('blocks Print with an offline message when hosted data has never loaded and is paused', async () => {
    await seedSyncedReplica();
    goOffline();

    render(<ReportsPage />, { initialRoute: SUPPLIES_ROUTE, queryClient: appLikeClient() });

    expect(
      await screen.findByText(/report's details could not be checked/i, {}, { timeout: 5000 })
    ).toBeInTheDocument();
    await clickPrint();

    expect(toastSpy).toHaveBeenCalledWith(
      expect.stringMatching(/No connection, so this report's details/i)
    );
  });

  it('shows an error, not an empty report, when the replica has never synced', async () => {
    goOffline();

    render(<ReportsPage />, { initialRoute: CHECK_IN_ROUTE, queryClient: appLikeClient() });

    expect(
      await screen.findByText(/could not load the report data/i, {}, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(screen.queryByText(/No entries found/i)).toBeNull();
    await clickPrint();
    expect(toastSpy).toHaveBeenCalledWith(expect.stringMatching(/could not be loaded/i));
  });

  it('blocks Print while an online refetch after a mutation is in flight, then prints the fresh rows', async () => {
    await seedSyncedReplica();
    const sheet = captureCheckInSheet();

    render(<ReportsPage />, { initialRoute: CHECK_IN_ROUTE, queryClient: appLikeClient() });
    await waitFor(() => expect(previewFrame().src).toMatch(/^blob:/), { timeout: 5000 });
    expect(sheet.callNames()).toEqual(['Aster', 'Bramble', 'Clover']);

    // Hold the next class read open, so the refetch is observably in flight.
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const realRead = replicatedEntriesTable.getEntriesByClass.bind(replicatedEntriesTable);
    vi.spyOn(replicatedEntriesTable, 'getEntriesByClass').mockImplementation(async classId => {
      await gate;
      return realRead(classId);
    });

    // The mutation: Clover moves to the front of the running order.
    await act(async () => {
      await replicatedEntriesTable.batchSet([entry('entry-c', 'dog-c', '103', 0)] as never);
    });

    // The preview says so, and hides the previous answer rather than show it as current.
    expect(await screen.findByText(/Updating the report/i)).toBeInTheDocument();
    expect(previewFrame().style.visibility).toBe('hidden');

    const print = vi.fn();
    Object.defineProperty(previewFrame().contentWindow!, 'print', { value: print });
    toastSpy.mockClear();
    await clickPrint();
    expect(toastSpy).toHaveBeenCalledWith(expect.stringMatching(/updating/i));
    expect(print).not.toHaveBeenCalled();

    // A replica write notifies on the leading AND trailing edge of its debounce;
    // let the trailing notice land while the read is still held, so the release
    // below settles the last refetch rather than racing a new one.
    await act(drainReplicaNotices);
    await act(async () => {
      release();
    });
    await waitFor(() => expect(sheet.callNames()).toEqual(['Clover', 'Aster', 'Bramble']));
    await waitFor(() => expect(screen.queryByText(/Updating the report/i)).toBeNull());
    expect(previewFrame().src).toMatch(/^blob:/);
    expect(previewFrame().style.visibility).toBe('visible');

    // The frame navigated to the new PDF, so it has a new window to print.
    const freshPrint = vi.fn();
    Object.defineProperty(previewFrame().contentWindow!, 'print', { value: freshPrint });
    toastSpy.mockClear();
    await clickPrint();
    expect(toastSpy).not.toHaveBeenCalledWith(expect.stringMatching(/updating/i));
    expect(freshPrint).toHaveBeenCalledTimes(1);
  });
});
