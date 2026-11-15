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

const replica = vi.hoisted(() => ({
  dogs: {} as Record<string, Record<string, unknown>>,
  fail: false,
}));
const DOGS: Record<string, Record<string, unknown>> = {
  e1: { id: 'e1', armband: '101', dogCallName: 'Willow', classId: 'c1' },
  e2: { id: 'e2', armband: '102', dogCallName: 'Juniper', classId: 'c1' },
  e3: { id: 'e3', armband: '103', dogCallName: 'Pip', classId: 'c2' },
  e4: { id: 'e4', armband: '104', dogCallName: 'Moss', classId: 'c2' },
};
// The device's replica row for each entry, whichever account it belongs to.
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getReplicatedRowIncludingOtherAccounts: vi.fn(async (id: string) => {
      if (replica.fail) throw new Error('replica read failed');
      const data = replica.dogs[id];
      return data ? { id, data } : null;
    }),
  },
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

/** The value shown beside a label in a row's score list. */
function field(row: HTMLElement, label: string): string | null {
  const term = within(row).queryByText(label, { selector: 'dt' });
  return term?.nextElementSibling?.textContent ?? null;
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
  replica.dogs = { ...DOGS };
  replica.fail = false;
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
    expect(field(rows[0]!, 'Result')).toBe('Qualified');
    expect(field(rows[0]!, 'Time')).toBe('0:04.35');
    expect(field(rows[0]!, 'Faults')).toBe('0');
    expect(within(rows[0]!).getByText('This class was cancelled.')).toBeInTheDocument();
    expect(
      within(rows[1]!).getByText('This class is now judged by Lee Okafor.')
    ).toBeInTheDocument();
    expect(field(rows[2]!, 'Result')).toBe('NQ');
    expect(field(rows[2]!, 'Time')).toBe('0:06.35');
    expect(field(rows[2]!, 'Faults')).toBe('2');
    expect(field(rows[2]!, 'Reason')).toBe('Handler error');
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

  it('Try again re-queues the refused score', async () => {
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
      '101 Willow in Container Novice A: Result Qualified · Time 0:04.35 · Faults 0.'
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

  // Review finding 1: every saved score field, so the secretary can key the whole score.
  it('shows each area time, the total, finds, faults, finish-call errors and points', async () => {
    const multiArea = refusedScore(0);
    multiArea.rpc = {
      name: RINGSIDE_RPC_FUNCTION,
      fields: {
        is_scored: true,
        result_status: 'qualified',
        search_time_seconds: 95.5,
        area1_time_seconds: 40.25,
        area2_time_seconds: 55.25,
        area3_time_seconds: null,
        area4_time_seconds: null,
        total_correct_finds: 3,
        total_incorrect_finds: 1,
        total_faults: 2,
        no_finish_count: 1,
        points_earned: 85,
      },
    };
    await seed([multiArea]);
    renderPage();
    const row = await screen.findByTestId('score-not-sent-row');
    expect(field(row, 'Area 1')).toBe('0:40.25');
    expect(field(row, 'Area 2')).toBe('0:55.25');
    expect(field(row, 'Area 3')).toBeNull();
    expect(field(row, 'Total time')).toBe('1:35.50');
    expect(field(row, 'Correct finds')).toBe('3');
    expect(field(row, 'Incorrect finds')).toBe('1');
    expect(field(row, 'Faults')).toBe('2');
    expect(field(row, 'Finish-call errors')).toBe('1');
    expect(field(row, 'Points')).toBe('85');
  });

  // Review finding 2: Remove deletes the score only; a refused check-in on the dog is kept.
  it('removes only the score, never a refused check-in on the same dog', async () => {
    const checkIn: PendingMutation = {
      ...refusedScore(0),
      id: 'c1',
      rpc: { name: RINGSIDE_RPC_FUNCTION, fields: { check_in_status: 'checked-in' } },
    };
    queue.mine = ['f1', 'c1'];
    await seed([refusedScore(0), checkIn]);
    renderPage();
    const row = await screen.findByTestId('score-not-sent-row');
    expect(
      within(row).getByText(/A check-in or ring change for this dog was not sent/)
    ).toBeVisible();

    fireEvent.click(within(row).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(queue.retry).toHaveBeenCalledTimes(1));
    expect(queue.retry).toHaveBeenCalledWith('f1');

    fireEvent.click(within(row).getByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('The check-in or ring change for this dog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove score' }));
    await waitFor(() => expect(queue.discard).toHaveBeenCalledWith('f1'));
    expect(queue.discard).not.toHaveBeenCalledWith('c1');
  });

  // Review finding 3: refused, then corrected, then the correction uploads.
  it('never offers the old refused version for Try again once a correction replaced it', async () => {
    const old = refusedScore(0);
    old.rpc = {
      name: RINGSIDE_RPC_FUNCTION,
      fields: {
        is_scored: true,
        result_status: 'nq',
        scoring_completed_at: '2026-11-14T10:00:00Z',
      },
    };
    const correction: PendingMutation = {
      ...old,
      id: 'p2',
      status: 'pending',
      error: undefined,
      timestamp: 50,
      rpc: {
        name: RINGSIDE_RPC_FUNCTION,
        fields: {
          is_scored: true,
          result_status: 'qualified',
          search_time_seconds: 30,
          scoring_completed_at: '2026-11-14T10:05:00Z',
        },
      },
    };
    // The correction is waiting: the row shows it, with nothing to resend.
    await seed([old], [correction]);
    const view = renderPage();
    let row = await screen.findByTestId('score-not-sent-row');
    expect(field(row, 'Result')).toBe('Qualified');
    expect(within(row).queryByRole('button', { name: 'Try again' })).toBeNull();
    view.unmount();

    // The correction uploads: it leaves the queue and the replica holds its run.
    const db = await databaseManager.getDatabase('AtShowScoresNotSentPage.test');
    await db.delete(REPLICATION_STORES.PENDING_MUTATIONS, 'p2');
    replica.dogs = { e1: { ...DOGS.e1, scoring_completed_at: '2026-11-14T10:05:00Z' } };
    renderPage();
    row = await screen.findByTestId('score-not-sent-row');
    expect(row).toHaveAttribute('data-state', 'superseded');
    expect(
      within(row).getByText(
        'A newer score for this dog was saved after this one, so this one will not be sent.'
      )
    ).toBeVisible();
    expect(within(row).queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(within(row).getByRole('button', { name: 'Remove' })).toBeVisible();
    expect(queue.retry).not.toHaveBeenCalled();
  });

  // Review finding 5: a failed device read is unknown, never "every score is sent".
  it('says it could not read the phone, with Try again, when the local read fails', async () => {
    const unstamped = { ...refusedScore(0) };
    delete unstamped.showId;
    await seed([unstamped]);
    replica.fail = true;
    renderPage();

    expect(
      await screen.findByText(
        'We could not read the scores on this phone, so we cannot say which are sent.'
      )
    ).toBeVisible();
    expect(screen.queryByText('Every score is sent.')).toBeNull();

    replica.fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('score-not-sent-row')).toBeInTheDocument();
  });
});
