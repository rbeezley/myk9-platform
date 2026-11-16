import { fromAny } from '@total-typescript/shoehorn';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';

import type { SyncableTrial } from '@/store/trial-store-types';
import { render } from '@/test/utils/testUtils';
import type { ResultsClassRow } from './buildResultsClassRows';
import { ResultsFinishRow } from './ResultsFinishRow';

const mocks = vi.hoisted(() => ({ getClassScoreAudits: vi.fn(), submissions: vi.fn() }));

vi.mock('@/services/database/entries/scoreAudit', () => ({
  getClassScoreAudits: mocks.getClassScoreAudits,
}));
vi.mock('@/hooks/mutations/useResultSubmission', () => ({
  useResultSubmissions: () => ({ data: mocks.submissions() }),
}));

const SENT = { status: 'sent', organization: 'AKC', submitted_at: '2026-11-14T19:40:00Z' };
const rows = [
  fromAny<ResultsClassRow, unknown>({
    id: 'c1',
    trialId: 't1',
    phase: 'done',
    expectedCount: 4,
    scoredCount: 4,
    releasedAt: '2026-11-14T18:00:00Z',
    judgeSignedOffAt: '2026-11-14T18:30:00Z',
    takesJudgeSignOff: true,
  }),
];
const trials = [fromAny<SyncableTrial, unknown>({ id: 't1', showId: 'show-1', registryId: 'AKC' })];
const history = (changedAt: string) => new Map([['e1', [{ id: 'a1', classId: 'c1', changedAt }]]]);

function renderRow() {
  render(<ResultsFinishRow showId="show-1" trials={trials} rows={rows} />);
}

describe('ResultsFinishRow results file freshness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.submissions.mockReturnValue([SENT]);
  });

  it('reads "Results changed since they were sent" and links to the send', async () => {
    mocks.getClassScoreAudits.mockResolvedValue(history('2026-11-14T20:15:00Z'));
    renderRow();
    const link = await screen.findByRole('link', { name: 'Results changed since they were sent' });
    expect(link).toHaveAttribute('href', '/shows/show-1/results?step=submit');
    expect(mocks.getClassScoreAudits).toHaveBeenCalledWith(['c1']);
  });

  it('stays ticked as sent when the only change came before the send', async () => {
    mocks.getClassScoreAudits.mockResolvedValue(history('2026-11-14T19:00:00Z'));
    renderRow();
    expect(await screen.findByText('Results file sent to AKC')).toBeInTheDocument();
    await waitFor(() => expect(mocks.getClassScoreAudits).toHaveBeenCalledTimes(1));
    await mocks.getClassScoreAudits.mock.results[0]?.value;
    expect(screen.queryByText('Results changed since they were sent')).not.toBeInTheDocument();
  });

  it('says it could not check when the score history cannot be read', async () => {
    mocks.getClassScoreAudits.mockRejectedValue(new Error('offline'));
    renderRow();
    expect(
      await screen.findByText('We could not check for score changes since they were sent.')
    ).toBeInTheDocument();
    expect(screen.getByText('Results file sent to AKC')).toBeInTheDocument();
  });

  it('does not read the history when nothing was sent', () => {
    mocks.submissions.mockReturnValue([]);
    renderRow();
    expect(mocks.getClassScoreAudits).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Submit to AKC' })).toBeInTheDocument();
  });
});
