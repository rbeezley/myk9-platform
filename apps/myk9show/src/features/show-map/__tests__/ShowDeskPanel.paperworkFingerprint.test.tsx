/**
 * Overview and Reports must agree on what has been printed.
 *
 * A print is "current" only when the fingerprint stored with the confirmation equals the one built
 * from the class's facts now. Reports fingerprints the full class rows (`getClassesByTrialId`,
 * including `time_limit_seconds` / `num_areas`); Overview used to fingerprint its own camelCase
 * projection WITHOUT them, so a print confirmed on either surface read as stale on the other.
 * These tests use the real descriptor builders on both sides.
 */
import { createDatabaseError } from '@/services/database/databaseError';
import { act, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';

import { createTestQueryClient, render } from '@/test/utils/testUtils';
import { queryKeys } from '@/lib/queryClient';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { Show } from '@/types/show-types';
import type { DbClass, DbEntry } from '@/types/database-mappings';
import type { ReplicatedPaperworkPrint } from '@/services/replication';

import ShowDeskPanel from '../ShowDeskPanel';
import { buildReportPaperworkDescriptor } from '../cockpit/buildReportPaperworkDescriptor';
import { derivePaperworkPrintState } from '../cockpit/paperworkPrintState';

const mocks = vi.hoisted(() => ({
  getClassesByTrialId: vi.fn(),
  getByShow: vi.fn(),
  confirmPrinted: vi.fn(),
  classListeners: new Set<() => void>(),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn() },
  createDatabaseError,
}));
vi.mock('@/services/database/day-of-operations', () => ({}));
vi.mock('@/services/database/entries/lifecycle', () => ({
  restoreEntryStatus: vi.fn(),
}));
vi.mock('@/services/database/classes', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/classes')>()),
  getClassesByTrialId: mocks.getClassesByTrialId,
}));
vi.mock('@/features/show-live-sync/showChangeSignal', () => ({
  subscribeToShowChanges: vi.fn(() => () => undefined),
}));
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: {
    updateClass: vi.fn(),
    subscribe: vi.fn((listener: () => void) => {
      mocks.classListeners.add(listener);
      return () => mocks.classListeners.delete(listener);
    }),
  },
  replicatedPaperworkPrintsTable: {
    subscribe: vi.fn(() => () => undefined),
    sync: vi.fn(async () => ({ success: true })),
    getByShow: mocks.getByShow,
    confirmPrinted: mocks.confirmPrinted,
    voidPrint: vi.fn(async () => undefined),
  },
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1', email: 'sec@example.com', user_metadata: {} } }),
}));
vi.mock('@/store/messageStore', () => ({
  useMessageStore: (
    selector: (state: {
      getOrCreateThread: ReturnType<typeof vi.fn>;
      sendMessage: ReturnType<typeof vi.fn>;
    }) => unknown
  ) => selector({ getOrCreateThread: vi.fn(), sendMessage: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/undoToast', () => ({ showUndoToast: vi.fn() }));

const show = {
  id: 'show-1',
  name: 'Spring Trial',
  clubName: 'Calm Canine Club',
  organization: 'AKC',
  startDate: '2026-06-12',
  endDate: '2026-06-14',
} as Show;

const trial = fromAny<SyncableTrial, unknown>({
  id: 'trial-1',
  showId: 'show-1',
  showName: 'Spring Trial',
  name: 'Friday AM',
  trialDate: '2026-06-12',
  trialNumber: 'Friday AM',
  timezone: 'America/New_York',
  order: '1',
  status: 'In Progress',
  _version: 1,
  _lastModified: new Date(),
  _lastModifiedBy: 'test',
  _syncStatus: 'synced',
});

/** The class row Reports reads: full DB shape, including the fingerprinted facts. */
const reportsClassRows = [
  {
    id: 'class-1',
    trial_id: 'trial-1',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    status: 'In Progress',
    judge_name: 'Judge Judy',
    time_limit_seconds: 180,
    num_areas: 2,
    num_hides: 3,
  },
] as unknown as DbClass[];

const entries = [
  {
    id: 'entry-1',
    class_id: 'class-1',
    dog_id: 'dog-1',
    armband: 101,
    run_order: 1,
    check_in_status: null,
    result_status: 'pending',
    entry_status: 'confirmed',
  },
] as unknown as DbEntry[];

/** What Overview is handed: camelCase tree rows with no time limit or area count. */
const overviewClassProps = [
  {
    id: 'class-1',
    trialId: 'trial-1',
    name: 'Container Novice',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    status: 'In Progress',
    judgeName: 'Judge Judy',
  },
];

const scope = {
  kind: 'class' as const,
  showId: 'show-1',
  trialId: 'trial-1',
  classId: 'class-1',
};

function reportsDescriptor() {
  const descriptor = buildReportPaperworkDescriptor({
    reportId: 'scoresheet',
    scope,
    classes: reportsClassRows,
    entries,
  });
  expect(descriptor).not.toBeNull();
  return descriptor!;
}

function renderOverview(queryClient = createTestQueryClient()) {
  return render(
    <ShowDeskPanel
      show={show}
      trials={[trial]}
      classes={overviewClassProps}
      entries={entries as unknown as Record<string, unknown>[]}
      canManageShow
      scopeNow={new Date('2026-06-12T15:00:00.000Z')}
    />,
    { initialRoute: '/shows/show-1/show-day?focus=class-1', queryClient }
  );
}

function printRecordFor(rows: DbClass[]): ReplicatedPaperworkPrint {
  const descriptor = buildReportPaperworkDescriptor({
    reportId: 'scoresheet',
    scope,
    classes: rows,
    entries,
  })!;
  return {
    id: 'print-1',
    showId: 'show-1',
    trialId: 'trial-1',
    classId: 'class-1',
    scopeKind: 'class',
    reportId: 'scoresheet',
    coverage: descriptor.coverage,
    fingerprint: descriptor.fingerprint,
    printedBy: 'user-1',
    printedByName: 'Jannie',
    printedAt: '2026-06-12T14:00:00.000Z',
  } as ReplicatedPaperworkPrint;
}

describe('Overview and Reports agree on what has been printed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClassesByTrialId.mockResolvedValue({ data: reportsClassRows, error: null });
    mocks.getByShow.mockResolvedValue([]);
  });

  it('reads a print confirmed from the Reports class rows as current on Overview', async () => {
    const descriptor = reportsDescriptor();
    const record: ReplicatedPaperworkPrint = {
      id: 'print-1',
      showId: 'show-1',
      trialId: 'trial-1',
      classId: 'class-1',
      scopeKind: 'class',
      reportId: 'scoresheet',
      coverage: descriptor.coverage,
      fingerprint: descriptor.fingerprint,
      printedBy: 'user-1',
      printedByName: 'Jannie',
      printedAt: '2026-06-12T14:00:00.000Z',
    } as ReplicatedPaperworkPrint;
    mocks.getByShow.mockResolvedValue([record]);

    renderOverview();

    await waitFor(() =>
      expect(screen.getAllByText(/Printed .* by Jannie/).length).toBeGreaterThan(0)
    );
    expect(screen.queryByText(/Class data changed after printing/)).not.toBeInTheDocument();
  });

  it('reads a print confirmed on Overview as current for the Reports descriptor', async () => {
    const { user } = renderOverview();

    const recordButton = await waitFor(() => {
      const button = screen
        .getAllByRole('button', { name: 'Record as printed' })
        .find(candidate =>
          candidate.closest('div.rounded-lg')?.textContent?.includes('Score sheets')
        );
      expect(button).toBeDefined();
      return button!;
    });
    await user.click(recordButton);
    await user.click(await screen.findByRole('button', { name: 'Mark printed' }));

    await waitFor(() => expect(mocks.confirmPrinted).toHaveBeenCalledTimes(1));
    const stored = mocks.confirmPrinted.mock.calls[0]![0] as {
      scope: typeof scope;
      reportId: string;
      coverage: Record<string, unknown>;
      fingerprint: string;
    };
    expect(stored.reportId).toBe('scoresheet');

    const printedFromOverview = {
      id: 'print-2',
      showId: 'show-1',
      trialId: 'trial-1',
      classId: 'class-1',
      scopeKind: 'class',
      reportId: stored.reportId,
      coverage: stored.coverage,
      fingerprint: stored.fingerprint,
      printedBy: 'user-1',
      printedByName: 'Jannie',
      printedAt: '2026-06-12T14:00:00.000Z',
    } as unknown as ReplicatedPaperworkPrint;

    expect(derivePaperworkPrintState([printedFromOverview], reportsDescriptor()).state).toBe(
      'current'
    );
  });
});

describe('Overview paperwork follows the replicated class rows and never claims on a failed read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.classListeners.clear();
    mocks.getClassesByTrialId.mockResolvedValue({ data: reportsClassRows, error: null });
    mocks.getByShow.mockResolvedValue([printRecordFor(reportsClassRows)]);
  });

  it('reads a print as stale, without a reload, when the replicated class changes after it', async () => {
    renderOverview();
    await waitFor(() =>
      expect(screen.getAllByText(/Printed .* by Jannie/).length).toBeGreaterThan(0)
    );
    expect(screen.queryByText(/Class data changed after printing/)).not.toBeInTheDocument();

    const changed = [{ ...reportsClassRows[0]!, time_limit_seconds: 240 }] as unknown as DbClass[];
    mocks.getClassesByTrialId.mockResolvedValue({ data: changed, error: null });
    expect(mocks.classListeners.size).toBeGreaterThan(0);
    act(() => mocks.classListeners.forEach(listener => listener()));

    expect(
      (await screen.findAllByText(/Class data changed after printing/)).length
    ).toBeGreaterThan(0);
  });

  it('stops claiming current and stops recording when a refetch fails over cached rows', async () => {
    const queryClient = createTestQueryClient();
    renderOverview(queryClient);
    await waitFor(() =>
      expect(screen.getAllByText(/Printed .* by Jannie/).length).toBeGreaterThan(0)
    );

    mocks.getClassesByTrialId.mockResolvedValue({ data: null, error: new Error('read failed') });
    await act(() => queryClient.invalidateQueries({ queryKey: queryKeys.showClasses('show-1') }));

    await waitFor(() =>
      expect(screen.getAllByText('Print history unavailable').length).toBeGreaterThan(0)
    );
    expect(screen.queryByText(/Printed .* by Jannie/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record as printed' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Print anyway').length).toBeGreaterThan(0);
  });

  it('does not claim current or offer to record while a replica-triggered refetch is in flight', async () => {
    renderOverview();
    await waitFor(() =>
      expect(screen.getAllByText(/Printed .* by Jannie/).length).toBeGreaterThan(0)
    );

    // The refetch started by the replica notice has not finished: the cached rows are obsolete.
    mocks.getClassesByTrialId.mockReturnValue(new Promise(() => undefined));
    act(() => mocks.classListeners.forEach(listener => listener()));

    await waitFor(() => expect(screen.queryByText(/Printed .* by Jannie/)).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Record as printed' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Print anyway').length).toBeGreaterThan(0);
  });

  it('re-reads the replica on remount, so a class changed while away reads as stale', async () => {
    const queryClient = createTestQueryClient();
    const first = renderOverview(queryClient);
    await waitFor(() =>
      expect(screen.getAllByText(/Printed .* by Jannie/).length).toBeGreaterThan(0)
    );
    first.unmount();

    // Changed while Overview was unmounted: its subscription never saw it.
    const changed = [{ ...reportsClassRows[0]!, time_limit_seconds: 240 }] as unknown as DbClass[];
    mocks.getClassesByTrialId.mockResolvedValue({ data: changed, error: null });
    renderOverview(queryClient);

    expect(
      (await screen.findAllByText(/Class data changed after printing/)).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/^Printed .* by Jannie/)).not.toBeInTheDocument();
  });

  it('keeps Print available while the class rows are still loading', async () => {
    mocks.getClassesByTrialId.mockReturnValue(new Promise(() => undefined));
    renderOverview();

    expect((await screen.findAllByText('Print anyway')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Record as printed' })).not.toBeInTheDocument();
  });

  it('keeps Print available when the class rows never loaded', async () => {
    mocks.getClassesByTrialId.mockResolvedValue({ data: null, error: new Error('read failed') });
    renderOverview();

    expect((await screen.findAllByText('Print anyway')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Record as printed' })).not.toBeInTheDocument();
  });
});
