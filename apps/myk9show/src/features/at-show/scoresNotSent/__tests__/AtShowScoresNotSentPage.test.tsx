import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import { AtShowScoresNotSentPage } from '../AtShowScoresNotSentPage';

const queue = vi.hoisted(() => ({ pending: [] as unknown[], failed: [] as unknown[] }));
const manager = vi.hoisted(() => ({
  retryFailedMutation: vi.fn(async () => undefined),
  discardFailedMutation: vi.fn(async () => undefined),
}));
vi.mock('@/services/replication/sharedMutationManager', () => ({
  mutationManager: {
    getPendingMutationsForTable: vi.fn(async () => queue.pending),
    getFailedMutations: vi.fn(async () => queue.failed),
    ...manager,
  },
}));

// IndexedDB reads only: the replica names the dogs and classes. PostgREST is never touched.
vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    getEntriesByShow: vi.fn(async () => [
      { id: 'e1', classId: 'c1', showId: 'show-1', armband: '100', dogCallName: 'Willow' },
      { id: 'e2', classId: 'c1', showId: 'show-1', armband: '101', dogCallName: 'Hazel' },
      { id: 'e3', classId: 'c1', showId: 'show-1', armband: '102', dogCallName: 'Moss' },
      { id: 'e4', classId: 'c1', showId: 'show-1', armband: '103', dogCallName: 'Juniper' },
    ]),
  },
  replicatedClassesTable: {
    getClassById: vi.fn(async () => ({ id: 'c1', element: 'Interior', level: 'Novice' })),
  },
}));

const network = vi.hoisted(() => ({ online: true }));
vi.mock('@/lib/networkUtils', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/networkUtils')>()),
  useOnlineStatus: () => network.online,
}));

function score(id: string, rowId: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    tableName: 'entries',
    operation: 'UPDATE',
    rowId,
    data: {},
    timestamp: Number(id.replace(/\D/g, '')) || 1,
    retries: 0,
    status: 'pending',
    rpc: {
      name: 'ringside_update_entry',
      fields: {
        is_scored: true,
        result_status: 'qualified',
        search_time_seconds: 4.35,
        total_faults: 0,
      },
    },
    ...overrides,
  };
}

const refused = (id: string, rowId: string, error: string) =>
  score(id, rowId, { status: 'failed', failureKind: 'permanent', error });

function renderPage() {
  return render(
    <Routes>
      <Route path="/at-show/:showId/scores-not-sent" element={<AtShowScoresNotSentPage />} />
    </Routes>,
    { initialRoute: '/at-show/show-1/scores-not-sent' }
  );
}

beforeEach(() => {
  queue.pending = [];
  queue.failed = [];
  network.online = true;
  vi.clearAllMocks();
});

describe('Scores not sent (MYK9-2011)', () => {
  it('lists a refused score with the dog, class, score and why, never the server text', async () => {
    queue.failed = [
      refused(
        'm1',
        'e1',
        'Non-retryable error: This class is cancelled. Scores and check-ins are closed.'
      ),
    ];
    renderPage();

    const row = await screen.findByTestId('scores-not-sent-row');
    expect(row).toHaveAttribute('data-state', 'refused');
    expect(within(row).getByText('100 Willow')).toBeInTheDocument();
    expect(within(row).getByText('Interior Novice')).toBeInTheDocument();
    expect(within(row).getByText('Qualified · 0:04.35 · 0 faults')).toBeInTheDocument();
    expect(
      within(row).getByText('Could not be sent. This class was cancelled.')
    ).toBeInTheDocument();
    expect(row).not.toHaveTextContent(/Non-retryable|check-ins are closed/);
    expect(screen.getByText(/^1 score not sent yet\./)).toBeInTheDocument();
  });

  it('names the judge when the class is judged by someone else', async () => {
    queue.failed = [refused('m1', 'e1', 'Non-retryable error: This class is judged by Lee Okafor')];
    renderPage();
    expect(
      await screen.findByText('Could not be sent. This class is now judged by Lee Okafor.')
    ).toBeInTheDocument();
  });

  it('lists all four of four refusals', async () => {
    queue.failed = ['e1', 'e2', 'e3', 'e4'].map((rowId, i) =>
      refused(`m${i + 1}`, rowId, 'Non-retryable error: This class is cancelled.')
    );
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId('scores-not-sent-row')).toHaveLength(4));
    for (const dog of ['100 Willow', '101 Hazel', '102 Moss', '103 Juniper']) {
      expect(screen.getByText(dog)).toBeInTheDocument();
    }
  });

  it('Try again puts the refused score back in the queue', async () => {
    queue.failed = [refused('m1', 'e1', 'Non-retryable error: This class is cancelled.')];
    const { user } = renderPage();
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(manager.retryFailedMutation).toHaveBeenCalledWith('m1'));
    expect(manager.discardFailedMutation).not.toHaveBeenCalled();
  });

  it('Remove asks first, naming the dog and the score', async () => {
    queue.failed = [refused('m1', 'e1', 'Non-retryable error: This class is cancelled.')];
    const { user } = renderPage();
    await user.click(await screen.findByRole('button', { name: 'Remove' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Remove the score for 100 Willow?')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Qualified · 0:04.35 · 0 faults.');
    expect(manager.discardFailedMutation).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }));
    expect(manager.discardFailedMutation).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove score' })
    );
    await waitFor(() => expect(manager.discardFailedMutation).toHaveBeenCalledWith('m1'));
  });

  it('lists a waiting score with no signal, with no Try again or Remove', async () => {
    network.online = false;
    queue.pending = [score('m1', 'e1')];
    renderPage();
    const row = await screen.findByTestId('scores-not-sent-row');
    expect(row).toHaveAttribute('data-state', 'waiting');
    expect(
      within(row).getByText('Not sent yet. It sends by itself when there is signal.')
    ).toBeInTheDocument();
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });

  it('says every score is sent when there are none', async () => {
    renderPage();
    expect(await screen.findByText('Every score is sent.')).toBeInTheDocument();
  });
});
