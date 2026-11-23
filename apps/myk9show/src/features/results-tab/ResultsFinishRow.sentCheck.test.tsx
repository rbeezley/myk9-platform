import { fromAny } from '@total-typescript/shoehorn';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';

import { SENT_FILE_TEXT } from '@/features/show-closeout/submissionTimes';
import type { SyncableTrial } from '@/store/trial-store-types';
import { render } from '@/test/utils/testUtils';
import { NO_FLAGS } from '@/features/show-closeout/flaggedPullsTestUtils';
import type { ResultsClassRow } from './buildResultsClassRows';
import { ResultsFinishRow } from './ResultsFinishRow';

const mocks = vi.hoisted(() => ({
  getChanges: vi.fn(),
  submissions: vi.fn(),
  unsynced: vi.fn(),
  notice: { current: () => {} },
  scheduleReady: { value: true },
}));

vi.mock('@/store/trialStore', () => ({
  useTrialStore: (select: (state: object) => unknown) =>
    select({
      trialsHasConfirmedSnapshot: mocks.scheduleReady.value,
      trialClassesHasConfirmedSnapshot: true,
    }),
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
  replicatedEntriesTable: {
    subscribe: (callback: () => void) => {
      mocks.notice.current = callback;
      return () => {};
    },
  },
}));

const SENT = { status: 'sent', organization: 'AKC', submitted_at: '2026-11-14T19:40:00Z' };
const ROW = fromAny<ResultsClassRow, unknown>({
  id: 'c1',
  trialId: 't1',
  phase: 'done',
  expectedCount: 4,
  scoredCount: 4,
  releasedAt: '2026-11-14T18:00:00Z',
  judgeSignedOffAt: '2026-11-14T18:30:00Z',
  takesJudgeSignOff: true,
});
const ROWS = [ROW];
const trials = [fromAny<SyncableTrial, unknown>({ id: 't1', showId: 'show-1', registryId: 'AKC' })];
const changes = (changedAt: string) => new Map([['c1', changedAt]]);
const FILE_LINE = 'Results file sent to AKC';
const CHANGED_LINE = SENT_FILE_TEXT.changed;
const COULD_NOT_CHECK = SENT_FILE_TEXT.unknown;

function renderRow() {
  return render(
    <ResultsFinishRow
      showId="show-1"
      trials={trials}
      rows={ROWS}
      entries={[]}
      entriesTrusted
      flaggedPulls={NO_FLAGS}
    />
  );
}

describe('ResultsFinishRow results file freshness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scheduleReady.value = true;
    mocks.submissions.mockReturnValue([SENT]);
    mocks.unsynced.mockResolvedValue(false);
  });

  it('reads the changed line and links to the send', async () => {
    mocks.getChanges.mockResolvedValue(changes('2026-11-14T20:15:00Z'));
    renderRow();
    const link = await screen.findByRole('link', { name: CHANGED_LINE });
    expect(link).toHaveAttribute('href', '/shows/show-1/results?step=submit');
    expect(mocks.getChanges).toHaveBeenCalledWith('show-1', '2026-11-14T19:40:00.000Z');
  });

  it('is not ticked while the history loads, then stays ticked when nothing changed', async () => {
    let resolve: (value: Map<string, string>) => void = () => {};
    mocks.getChanges.mockReturnValue(new Promise(done => (resolve = done)));
    renderRow();
    expect(await screen.findByText(SENT_FILE_TEXT.checking)).toBeInTheDocument();
    const loadingLine = screen.getByText(FILE_LINE).closest('li') as HTMLElement;
    expect(within(loadingLine).queryByLabelText('Done')).toBeNull();

    await act(async () => resolve(new Map()));
    const line = (await screen.findByText(FILE_LINE)).closest('li') as HTMLElement;
    expect(within(line).getByLabelText('Done')).toBeInTheDocument();
    expect(screen.queryByText(SENT_FILE_TEXT.checking)).toBeNull();
  });

  it('says it could not check when the score history cannot be read', async () => {
    mocks.getChanges.mockRejectedValue(new Error('offline'));
    renderRow();
    expect(await screen.findByText(COULD_NOT_CHECK)).toBeInTheDocument();
  });

  it('cannot tell while a score change waits in this device queue, and does not read', async () => {
    mocks.unsynced.mockResolvedValue(true);
    renderRow();
    expect(await screen.findByText(COULD_NOT_CHECK)).toBeInTheDocument();
    expect(mocks.getChanges).not.toHaveBeenCalled();
  });

  it('cannot tell, never stuck loading, when the queue read throws', async () => {
    mocks.unsynced.mockRejectedValue(new Error('idb'));
    renderRow();
    expect(await screen.findByText(COULD_NOT_CHECK)).toBeInTheDocument();
    expect(screen.queryByText(SENT_FILE_TEXT.checking)).toBeNull();
  });

  it('re-reads after the replica notice, so a correction to an already scored dog flips the line', async () => {
    mocks.getChanges.mockResolvedValueOnce(new Map());
    renderRow();
    const line = (await screen.findByText(FILE_LINE)).closest('li') as HTMLElement;
    await waitFor(() => expect(within(line).getByLabelText('Done')).toBeInTheDocument());
    expect(mocks.getChanges).toHaveBeenCalledTimes(1);

    // The dog's count is unchanged (4 of 4); only the replica says a score was written.
    mocks.getChanges.mockResolvedValue(changes('2026-11-14T20:15:00Z'));
    act(() => mocks.notice.current());
    await waitFor(() => expect(mocks.getChanges).toHaveBeenCalledTimes(2), { timeout: 8000 });
    expect(
      await screen.findByRole('link', { name: CHANGED_LINE }, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(mocks.getChanges).toHaveBeenCalledTimes(2);
  }, 20_000);

  it('is checking, never ticked, while the schedule has not loaded, and reads nothing', async () => {
    mocks.scheduleReady.value = false;
    renderRow();
    expect(await screen.findByText(SENT_FILE_TEXT.checking)).toBeInTheDocument();
    const line = screen.getByText(FILE_LINE).closest('li') as HTMLElement;
    expect(within(line).queryByLabelText('Done')).toBeNull();
    expect(mocks.getChanges).not.toHaveBeenCalled();
  });

  it('does not read the history when nothing was sent', () => {
    mocks.submissions.mockReturnValue([]);
    renderRow();
    expect(mocks.getChanges).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Submit to AKC' })).toBeInTheDocument();
  });
});

describe('ResultsFinishRow results deadline', () => {
  const openTrials = [
    fromAny<SyncableTrial, unknown>({
      id: 't1',
      showId: 'show-1',
      registryId: 'AKC',
      trialDate: '2026-11-17',
      timezone: 'America/Los_Angeles',
    }),
  ];
  const show = () =>
    render(
      <ResultsFinishRow
        showId="show-1"
        trials={openTrials}
        rows={ROWS}
        entries={[]}
        entriesTrusted
        flaggedPulls={NO_FLAGS}
      />
    );

  beforeEach(() => {
    mocks.scheduleReady.value = true;
    mocks.getChanges.mockResolvedValue(new Map());
    mocks.unsynced.mockReturnValue(false);
  });

  it('shows when AKC must receive the results on an open line, and not on a done one', async () => {
    mocks.submissions.mockReturnValue([]);
    const { unmount } = show();
    const list = within(await screen.findByRole('region', { name: 'Finish the show' }));
    expect(await list.findByText('Due at AKC by Tue, Nov 24')).toBeInTheDocument();
    unmount();

    mocks.submissions.mockReturnValue([SENT]);
    show();
    const done = within(await screen.findByRole('region', { name: 'Finish the show' }));
    expect(await done.findByText(FILE_LINE)).toBeInTheDocument();
    expect(done.queryByText(/Due at AKC/)).not.toBeInTheDocument();
  });

  it('keeps the deadline on the resend line when a score changed after the AKC file went', async () => {
    mocks.submissions.mockReturnValue([SENT]);
    mocks.getChanges.mockResolvedValue(changes('2026-11-14T20:15:00Z'));
    render(
      <ResultsFinishRow
        showId="show-1"
        trials={openTrials}
        rows={ROWS}
        entries={[]}
        entriesTrusted
        flaggedPulls={NO_FLAGS}
      />
    );
    await screen.findByRole('link', { name: new RegExp(CHANGED_LINE) });
    expect(screen.getByText('Due at AKC by Tue, Nov 24')).toBeInTheDocument();
  });
});
