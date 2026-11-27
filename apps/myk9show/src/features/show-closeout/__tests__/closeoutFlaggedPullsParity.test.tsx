import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { act, within } from '@testing-library/react';
import { fromAny } from '@total-typescript/shoehorn';
import { QueryClient } from '@tanstack/react-query';
import { createTestQueryClient, render, screen } from '@/test/utils/testUtils';
import { queryKeys } from '@/lib/queryClient';
import ShowCloseStep from '@/pages/secretary/ShowCloseStep';
import { ResultsFinishRow } from '@/features/results-tab/ResultsFinishRow';
import { useResultsTabData } from '@/features/results-tab/useResultsTabData';
import type { SyncableTrial } from '@/store/trial-store-types';

/**
 * MYK9-2180: the Results tab's Finish list and the close step derive unconfirmed pull flags with one
 * hook (`useCloseoutFlaggedPulls`, not mocked here) from their own entries reads
 * (`useResultsTabData`, `useShowCloseoutInputs`), so for one data set they show the same count and
 * the same "Not on this device's class list" dogs, and a failed refresh, or one awaiting its retry, is "couldn't
 * check" in both, never a count from the rows still cached.
 */

const replica = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], fail: false }));
const clearFlaggedPull = vi.hoisted(() => vi.fn());
const scratchShowMapEntry = vi.hoisted(() => vi.fn());

vi.mock('@/services/database/entries', () => ({
  getEntriesForShow: vi.fn(async () =>
    replica.fail
      ? { data: null, error: new Error('offline') }
      : { data: replica.rows.map(row => ({ ...row })), error: null }
  ),
  getEntriesByShow: vi.fn(),
  getPublicEntriesByShow: vi.fn(),
  getEntriesByDog: vi.fn(),
  getEntriesByStatus: vi.fn(),
  searchEntries: vi.fn(),
}));
vi.mock('@/services/database/entries/flaggedPull', () => ({ clearFlaggedPull }));
vi.mock('@/features/show-map/showMapActionMutations', () => ({
  scratchShowMapEntry,
  undoShowMapScratch: vi.fn(),
}));
vi.mock('@/hooks/queries/useRefreshShowEntriesOnOpen', () => ({
  useRefreshShowEntriesOnOpen: () => undefined,
}));
vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: { subscribe: () => () => {} },
  replicatedShowsTable: {
    updateShow: vi.fn(),
    getShowById: vi.fn(async () => ({ id: 'show-1', isNationals: false })),
    subscribe: () => () => {},
  },
  replicatedTrialsTable: { updateTrial: vi.fn() },
  replicatedClassesTable: { updateClass: vi.fn() },
}));
// The Results tab's print and release reads are not what this test is about.
vi.mock('@/features/show-map/cockpit/useShowClassPaperwork', () => ({
  useShowClassPaperwork: () => ({
    byClassId: new Map(),
    printedSheetEntries: [],
    available: true,
    hasPrintRecords: false,
    classRows: [],
    reads: [],
    refetch: () => undefined,
  }),
}));
vi.mock('@/features/show-closeout/useResultsSentCheck', () => ({
  useResultsSentCheck: () => ({ submissions: [{ status: 'sent' }], scoreChanges: undefined }),
}));
vi.mock('@/services/database/show-incidents', () => ({
  showIncidentCloseoutQueryKey: (showId: string) => ['show-incidents', showId],
  listShowIncidentCloseout: vi.fn(async () => []),
}));
vi.mock('@/services/database/show-payments', () => ({
  listShowPayments: vi.fn(async () => []),
  showPaymentsQueryKey: (showId: string) => ['show-payments', showId],
}));
vi.mock('@/hooks/useFastShowDetails', () => ({
  useFastShowDetails: () => ({
    show: { id: 'show-1', status: 'published', startDate: '2026-10-10', endDate: '2026-10-10' },
    isLoading: false,
  }),
}));

const trialStoreState = vi.hoisted(() => ({
  trials: [{ id: 'trial-1', showId: 'show-1', status: 'active', trialDate: '2026-10-10' }],
  trialClasses: { 'trial-1': [{ id: 'class-1', status: 'completed' }] },
  trialsReadStatus: 'success',
  trialsHasConfirmedSnapshot: true,
  trialClassesReadStatus: 'success',
  trialClassesHasConfirmedSnapshot: true,
  loadTrials: vi.fn(),
  loadTrialClasses: vi.fn(),
}));
vi.mock('@/store/trialStore', () => ({
  useTrialStore: (selector: (state: typeof trialStoreState) => unknown) =>
    selector(trialStoreState),
}));

const flagged = (id: string, dogId: string, dogName: string, className: string | null) => ({
  id,
  dog_id: dogId,
  class_id: 'class-1',
  trial_id: 'trial-1',
  show_id: 'show-1',
  entry_fee: 35,
  entry_status: 'confirmed',
  is_scored: false,
  check_in_status: 'pulled',
  payment_status: 'paid',
  payment_method: 'online',
  dog: { id: dogId, name: dogName, call_name: null },
  class: className === null ? null : { id: 'class-1', name: className },
  trial: { trial_type: null, trial_date: '2026-10-10', trial_number: '1' },
});

/** The Finish list as the Results tab mounts it, fed by the tab's own entries read. */
function ResultsFinish() {
  const data = useResultsTabData('show-1');
  return (
    <ResultsFinishRow
      showId="show-1"
      trials={TRIALS}
      rows={[]}
      entries={data.entries}
      entriesTrusted
      flaggedPulls={data.flaggedPulls}
    />
  );
}

const TRIALS = [fromAny<SyncableTrial, unknown>({ id: 'trial-1', showId: 'show-1' })];
const FLAG_TEXT = '2 dogs flagged as pulled at the show, not confirmed.';
const GROUP = "Not on this device's class list";
const FAILED_TEXT = "Couldn't check for dogs flagged as pulled at the show.";

function renderBoth(queryClient: QueryClient = createTestQueryClient()) {
  const view = render(
    <Routes>
      <Route
        path="/shows/:id/results"
        element={
          <>
            <ResultsFinish />
            <ShowCloseStep />
          </>
        }
      />
    </Routes>,
    { initialRoute: '/shows/show-1/results?step=close', queryClient }
  );
  return { ...view, queryClient };
}

/** Waits for the close step, which shows a skeleton until the entries are read. */
const closeStepReady = () => screen.findByRole('region', { name: 'Before you close the show' });
const finishList = () => within(screen.getByRole('region', { name: 'Finish the show' }));
const closeCard = () => within(screen.getByRole('region', { name: 'Before you close the show' }));
const closeAction = () => within(screen.getByRole('region', { name: 'Close the show' }));

describe('MYK9-2180: one flagged-pull read for the Finish list and the close step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replica.fail = false;
    replica.rows = [
      flagged('entry-1', 'dog-1', 'Poppy', 'Container Novice A'),
      // Its class is not on this device's class list: listed under the neutral group.
      { ...flagged('entry-2', 'dog-2', 'Biscuit', null), class_id: 'gone-class' },
    ];
  });

  it('shows the same count and the same off-list dog in both', async () => {
    renderBoth();
    await closeStepReady();

    expect(await closeCard().findByText(FLAG_TEXT)).toBeInTheDocument();
    expect(finishList().getByRole('link', { name: FLAG_TEXT })).toBeInTheDocument();
    expect(closeAction().getByText(FLAG_TEXT, { exact: false })).toBeInTheDocument();

    for (const view of [finishList(), closeCard()]) {
      const group = within(view.getByRole('group', { name: GROUP }));
      expect(group.getAllByRole('listitem').map(item => item.textContent)).toEqual([
        expect.stringContaining('Biscuit'),
      ]);
      expect(group.queryByText('Poppy')).not.toBeInTheDocument();
    }
    // This device cannot prove a class was removed, so no screen says it was.
    expect(document.body.textContent).not.toMatch(/removed|deleted/i);
  });

  it('says "couldn\'t check" in both after a failed refresh, never the cached count', async () => {
    const { queryClient } = renderBoth();
    await closeStepReady();
    expect(await closeCard().findByText(FLAG_TEXT)).toBeInTheDocument();

    replica.fail = true;
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: queryKeys.showEntries('show-1') });
    });

    expect(await finishList().findByText(FAILED_TEXT)).toBeInTheDocument();
    expect(closeCard().getByText(FAILED_TEXT)).toBeInTheDocument();
    expect(closeAction().getByText(FAILED_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(FLAG_TEXT, { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: GROUP })).not.toBeInTheDocument();
  });

  it('says "couldn\'t check" in both while a failed read awaits its retry', async () => {
    // Production retries a failed read; while it waits (or pauses offline) isError stays false.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: 1, retryDelay: 60_000, gcTime: Infinity } },
    });
    renderBoth(queryClient);
    await closeStepReady();
    expect(await closeCard().findByText(FLAG_TEXT)).toBeInTheDocument();

    replica.fail = true;
    await act(async () => {
      void queryClient.refetchQueries({ queryKey: queryKeys.showEntries('show-1') });
    });

    expect(await finishList().findByText(FAILED_TEXT)).toBeInTheDocument();
    expect(queryClient.getQueryState(queryKeys.showEntries('show-1'))?.status).toBe('success');
    expect(closeCard().getByText(FAILED_TEXT)).toBeInTheDocument();
    expect(closeAction().getByText(FAILED_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(FLAG_TEXT, { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Confirm the pull/ })).not.toBeInTheDocument();
    queryClient.clear();
  });

  it("acts on an off-list flag with the desk's own Confirm and Clear", async () => {
    clearFlaggedPull.mockResolvedValue('checked-in');
    const { user } = renderBoth();
    await closeStepReady();
    const group = within(await closeCard().findByRole('group', { name: GROUP }));

    await user.click(
      group.getByRole('button', {
        name: 'Clear the pull flag for Biscuit, Sat Oct 10, Trial 1, entry NTRY-2',
      })
    );
    expect(clearFlaggedPull).toHaveBeenCalledWith('entry-2');

    await user.click(
      group.getByRole('button', {
        name: 'Confirm the pull for Biscuit, Sat Oct 10, Trial 1, entry NTRY-2',
      })
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Biscuit/)).toBeInTheDocument();
  });

  it('tells one dog flagged in the same class on two days apart: rows, buttons and dialogs', async () => {
    const sat = { ...flagged('entry-sat001', 'dog-2', 'Biscuit', null), class_id: 'gone' };
    replica.rows = [
      sat,
      {
        ...sat,
        id: 'entry-sun002',
        trial_id: 'trial-2',
        trial: { trial_type: null, trial_date: '2026-10-11', trial_number: '2' },
      },
    ];
    const { user } = renderBoth();
    await closeStepReady();
    const SAT = 'Biscuit, Sat Oct 10, Trial 1, entry SAT001';
    const SUN = 'Biscuit, Sun Oct 11, Trial 2, entry SUN002';

    for (const view of [finishList(), closeCard()]) {
      const group = within(await view.findByRole('group', { name: GROUP }));
      const rows = group.getAllByRole('listitem').map(item => item.textContent);
      expect(rows).toHaveLength(2);
      expect(new Set(rows).size).toBe(2);
      expect(rows[0]).toContain('Sat Oct 10, Trial 1, entry SAT001');
      expect(rows[1]).toContain('Sun Oct 11, Trial 2, entry SUN002');
      for (const target of [SAT, SUN]) {
        expect(group.getByRole('button', { name: `Confirm the pull for ${target}` })).toBeEnabled();
        expect(
          group.getByRole('button', { name: `Clear the pull flag for ${target}` })
        ).toBeEnabled();
      }
    }

    const group = within(closeCard().getByRole('group', { name: GROUP }));
    await user.click(group.getByRole('button', { name: `Confirm the pull for ${SAT}` }));
    const satDialog = (await screen.findByRole('dialog')).textContent;
    expect(satDialog).toContain('Sat Oct 10, Trial 1, entry SAT001');
    expect(satDialog).not.toContain('SUN002');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /cancel/i }));

    await user.click(group.getByRole('button', { name: `Confirm the pull for ${SUN}` }));
    const sunDialog = (await screen.findByRole('dialog')).textContent;
    expect(sunDialog).toContain('Sun Oct 11, Trial 2, entry SUN002');
    expect(sunDialog).not.toContain('SAT001');
    expect(sunDialog).not.toMatch(/removed|deleted/i);

    // The Pull writes the Sunday entry, never its Saturday twin.
    scratchShowMapEntry.mockResolvedValue({ entryId: 'entry-sun002' });
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Pull' }));
    await vi.waitFor(() => expect(scratchShowMapEntry).toHaveBeenCalledTimes(1));
    expect(scratchShowMapEntry).toHaveBeenCalledWith('entry-sun002', undefined, expect.anything());
  });
});
