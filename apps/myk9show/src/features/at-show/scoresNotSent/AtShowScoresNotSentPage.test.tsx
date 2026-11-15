/**
 * MYK9-2011: the Scores not sent list reads this device only. The queue rows are written to
 * the real (fake-indexeddb) replication database, so the page is tested against the same
 * stores a reload or a new passcode leaves behind; the server is never read.
 */
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager, REPLICATION_STORES, type PendingMutation } from '@myk9/replication';
import { fireEvent, render, screen, waitFor, within } from '@/test/utils/testUtils';
import { RINGSIDE_RPC_FUNCTION } from '@/services/replication/ringsideEntryRpc';
import { AtShowScoresNotSentPage } from './AtShowScoresNotSentPage';

const queue = vi.hoisted(() => ({
  mine: [] as string[],
  retry: vi.fn(async (id: string) => {
    void id;
  }),
  discard: vi.fn(async (id: string) => {
    void id;
  }),
}));
vi.mock('@/services/replication/sharedMutationManager', () => ({
  mutationManager: {
    getFailedMutations: vi.fn(async () => queue.mine.map(id => ({ id }))),
    retryFailedMutation: (id: string) => queue.retry(id),
    discardFailedMutation: (id: string) => queue.discard(id),
  },
}));

const DOGS = [
  { id: 'e1', armband: '101', dogCallName: 'Willow', classId: 'c1' },
  { id: 'e2', armband: '102', dogCallName: 'Juniper', classId: 'c1' },
  { id: 'e3', armband: '103', dogCallName: 'Pip', classId: 'c2' },
  { id: 'e4', armband: '104', dogCallName: 'Moss', classId: 'c2' },
];
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { getEntriesByShow: vi.fn(async () => DOGS) },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: {
    getClassById: vi.fn(async (id: string) => ({
      id,
      name: id === 'c1' ? 'Container Novice A' : 'Interior Advanced',
    })),
  },
}));

const RAW = 'Non-retryable error: new row violates check constraint "entries_chk_42"';
const ERRORS = [
  'Non-retryable error: This class is cancelled. Scores and check-ins are closed.',
  'Non-retryable error: This class is judged by Lee Okafor',
  RAW,
  'Max retries exceeded: internal error',
];

function refusedScore(i: number): PendingMutation {
  return {
    id: `f${i + 1}`,
    authUserId: 'judge-1',
    showId: 'show-1',
    tableName: 'entries',
    operation: 'UPDATE',
    rowId: `e${i + 1}`,
    data: {},
    timestamp: i + 1,
    retries: 1,
    status: 'failed',
    error: ERRORS[i] ?? '',
    failureKind: i === 1 ? 'authorization' : i === 3 ? 'max-retries' : 'permanent',
    rpc: {
      name: RINGSIDE_RPC_FUNCTION,
      fields: {
        is_scored: true,
        result_status: i === 2 ? 'nq' : 'qualified',
        search_time_seconds: 4.35 + i,
        total_faults: i,
        ...(i === 2 && { disqualification_reason: 'Handler error' }),
      },
    },
  };
}

async function seed(failed: PendingMutation[], pending: PendingMutation[] = []) {
  const db = await databaseManager.getDatabase('AtShowScoresNotSentPage.test');
  for (const m of failed) await db.put(REPLICATION_STORES.FAILED_MUTATIONS, m);
  for (const m of pending) await db.put(REPLICATION_STORES.PENDING_MUTATIONS, m);
}

// The replication database stays open across tests; empty its queue stores so no row leaks.
async function clearQueue() {
  const db = await databaseManager.getDatabase('AtShowScoresNotSentPage.test');
  await db.clear(REPLICATION_STORES.PENDING_MUTATIONS);
  await db.clear(REPLICATION_STORES.FAILED_MUTATIONS);
}

function renderPage() {
  return render(
    <Routes>
      <Route path="/at-show/:showId/scores-not-sent" element={<AtShowScoresNotSentPage />} />
    </Routes>,
    { initialRoute: '/at-show/show-1/scores-not-sent' }
  );
}

beforeEach(async () => {
  await clearQueue();
  queue.mine = ['f1', 'f2', 'f3', 'f4'];
  queue.retry.mockClear();
  queue.discard.mockClear();
});

describe('AtShowScoresNotSentPage', () => {
  it('lists all four refused scores by dog, class, score and plain reason', async () => {
    await seed([0, 1, 2, 3].map(refusedScore));
    renderPage();

    const rows = await screen.findAllByTestId('score-not-sent-row');
    expect(rows).toHaveLength(4);
    expect(within(rows[0]!).getByText('101 Willow')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Container Novice A')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Qualified · 0:04.35 · 0 faults')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('This class was cancelled.')).toBeInTheDocument();
    expect(
      within(rows[1]!).getByText('This class is now judged by Lee Okafor.')
    ).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Not qualified · 0:06.35 · 2 faults')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Reason: Handler error')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('myK9Show did not accept this score.')).toBeInTheDocument();
    // No row shows the server's own text.
    expect(document.body.textContent).not.toContain('entries_chk_42');
    expect(document.body.textContent).not.toContain('Non-retryable');
  });

  it('shows a waiting score with no actions', async () => {
    await seed([], [{ ...refusedScore(0), status: 'pending', error: undefined }]);
    renderPage();
    const row = await screen.findByTestId('score-not-sent-row');
    expect(within(row).getByText('Waiting to send. It will be sent on its own.')).toBeVisible();
    expect(within(row).queryByRole('button')).toBeNull();
  });

  it('says every score is sent only once the device has been read and holds none', async () => {
    renderPage();
    expect(await screen.findByText('Every score is sent.')).toBeInTheDocument();
  });

  it('Try again re-queues every refused row for that dog', async () => {
    await seed([refusedScore(0)]);
    renderPage();
    const row = await screen.findByTestId('score-not-sent-row');
    fireEvent.click(within(row).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(queue.retry).toHaveBeenCalledWith('f1'));
    expect(queue.discard).not.toHaveBeenCalled();
  });

  it('removes a score only after a confirmation that names the dog and the score', async () => {
    await seed([refusedScore(0)]);
    renderPage();
    const row = await screen.findByTestId('score-not-sent-row');
    fireEvent.click(within(row).getByRole('button', { name: 'Remove' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Remove the score for 101 Willow?')).toBeInTheDocument();
    expect(dialog.textContent).toContain(
      '101 Willow in Container Novice A: Qualified · 0:04.35 · 0 faults.'
    );
    expect(queue.discard).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove score' }));
    await waitFor(() => expect(queue.discard).toHaveBeenCalledWith('f1'));
  });

  it('keeps a score saved under an earlier sign-in on the list, without actions', async () => {
    queue.mine = [];
    await seed([refusedScore(0)]);
    renderPage();
    const row = await screen.findByTestId('score-not-sent-row');
    expect(within(row).getByText('101 Willow')).toBeInTheDocument();
    expect(
      within(row).getByText(
        'Saved under an earlier sign-in on this phone. Show this score to the secretary.'
      )
    ).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});
