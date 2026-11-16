import { fromAny } from '@total-typescript/shoehorn';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';

import type { SyncableTrial } from '@/store/trial-store-types';
import { render } from '@/test/utils/testUtils';
import type { ResultsClassRow } from './buildResultsClassRows';
import { ResultsFinishRow } from './ResultsFinishRow';

const mocks = vi.hoisted(() => ({
  getChanges: vi.fn(),
  submissions: vi.fn(),
  unsynced: vi.fn(),
}));

vi.mock('@/services/database/entries/scoreAudit', () => ({
  getFileScoreChangesSince: mocks.getChanges,
}));
vi.mock('@/hooks/mutations/useResultSubmission', () => ({
  useResultSubmissions: () => ({ data: mocks.submissions() }),
}));
vi.mock('@/features/results-tab/useClassUnsyncedScores', () => ({
  classHasUnsyncedScores: (id: string) => mocks.unsynced(id),
}));
vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: { subscribe: () => () => {} },
}));

const SENT = { status: 'sent', organization: 'AKC', submitted_at: '2026-11-14T19:40:00Z' };
const makeRow = (scoredCount: number) =>
  fromAny<ResultsClassRow, unknown>({
    id: 'c1',
    trialId: 't1',
    phase: 'done',
    expectedCount: 4,
    scoredCount,
    releasedAt: '2026-11-14T18:00:00Z',
    judgeSignedOffAt: '2026-11-14T18:30:00Z',
    takesJudgeSignOff: true,
  });
const trials = [fromAny<SyncableTrial, unknown>({ id: 't1', showId: 'show-1', registryId: 'AKC' })];
const changes = (changedAt: string) => new Map([['c1', changedAt]]);

function renderRow(rows = [makeRow(4)]) {
  return render(<ResultsFinishRow showId="show-1" trials={trials} rows={rows} />);
}

describe('ResultsFinishRow results file freshness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.submissions.mockReturnValue([SENT]);
    mocks.unsynced.mockResolvedValue(false);
  });

  it('reads "Results changed since they were sent" and links to the send', async () => {
    mocks.getChanges.mockResolvedValue(changes('2026-11-14T20:15:00Z'));
    renderRow();
    const link = await screen.findByRole('link', { name: 'Results changed since they were sent' });
    expect(link).toHaveAttribute('href', '/shows/show-1/results?step=submit&reason=changed');
    expect(mocks.getChanges).toHaveBeenCalledWith('show-1', '2026-11-14T19:40:00.000Z');
  });

  it('is not ticked while the history loads, then stays ticked when nothing changed', async () => {
    let resolve: (value: Map<string, string>) => void = () => {};
    mocks.getChanges.mockReturnValue(new Promise(done => (resolve = done)));
    renderRow();
    expect(
      await screen.findByText('Checking for score changes since the file was sent.')
    ).toBeInTheDocument();
    const loadingLine = screen.getByText('Results file sent to AKC').closest('li') as HTMLElement;
    expect(within(loadingLine).queryByLabelText('Done')).toBeNull();

    await act(async () => resolve(new Map()));
    expect(await screen.findByText('Results file sent to AKC')).toBeInTheDocument();
    expect(screen.queryByText('Checking for score changes since the file was sent.')).toBeNull();
    const line = screen.getByText('Results file sent to AKC').closest('li') as HTMLElement;
    expect(within(line).getByLabelText('Done')).toBeInTheDocument();
  });

  it('says it could not check when the score history cannot be read', async () => {
    mocks.getChanges.mockRejectedValue(new Error('offline'));
    renderRow();
    expect(
      await screen.findByText('We could not check for score changes since they were sent.')
    ).toBeInTheDocument();
  });

  it('cannot tell while a score change is waiting in this device queue, and does not read', async () => {
    mocks.unsynced.mockResolvedValue(true);
    renderRow();
    expect(
      await screen.findByText('We could not check for score changes since they were sent.')
    ).toBeInTheDocument();
    expect(mocks.getChanges).not.toHaveBeenCalled();
  });

  it('reads the history again when a class gains a score', async () => {
    mocks.getChanges.mockResolvedValue(new Map());
    const view = renderRow([makeRow(3)]);
    await waitFor(() => expect(mocks.getChanges).toHaveBeenCalledTimes(1));
    view.rerender(<ResultsFinishRow showId="show-1" trials={trials} rows={[makeRow(4)]} />);
    await waitFor(() => expect(mocks.getChanges).toHaveBeenCalledTimes(2));
  });

  it('does not read the history when nothing was sent', () => {
    mocks.submissions.mockReturnValue([]);
    renderRow();
    expect(mocks.getChanges).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Submit to AKC' })).toBeInTheDocument();
  });
});
