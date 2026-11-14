import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import type { ResultsClassRow } from '@/features/results-tab/buildResultsClassRows';
import { render, screen, waitFor } from '@/test/utils/testUtils';

const mocks = vi.hoisted(() => ({
  printIframeAndWait: vi.fn(),
  getClassScoreAudits: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('@/pages/secretary/ReportsPage/reportPreviewUtils', () => ({
  printIframeAndWait: mocks.printIframeAndWait,
}));
vi.mock('@/services/database/entries/scoreAudit', () => ({
  getClassScoreAudits: mocks.getClassScoreAudits,
}));

import { TrialPacketPanel } from './TrialPacketPanel';

const BUILT = { timeout: 15000 };

function row(id: string, judgeName: string, overrides: Partial<ResultsClassRow> = {}) {
  return {
    id,
    trialId: 't1',
    trialDate: '2026-12-07',
    trialLabel: 'Trial 1',
    name: `Class ${id}`,
    judgeName,
    judgeId: `id-${judgeName}`,
    judgeSignedOffAt: null,
    registryId: 'AKC',
    runFinished: true,
    takesJudgeSignOff: true,
    entries: [
      {
        entryId: `e-${id}`,
        armband: '101',
        dogName: 'Juni',
        handlerName: 'Jamie Walker',
        placement: 1,
        resultLabel: 'Q',
        qualified: true,
        timeLabel: '0:41.25',
        faults: 0,
      },
    ],
    ...overrides,
  } as unknown as ResultsClassRow;
}

const ROWS = [
  row('interior', 'Pat'),
  row('exterior', 'Sam'),
  row('container', 'Pat'),
  row('cancelled', 'Pat', { takesJudgeSignOff: false }),
];
const REVIEW = {
  rows: ROWS,
  entries: [],
  showName: 'Winter Trial',
  timeZone: 'America/Los_Angeles',
};

function renderPanel(judgeKey: string | null) {
  URL.createObjectURL = vi.fn(() => 'blob:review');
  URL.revokeObjectURL = vi.fn();
  render(
    <TrialPacketPanel
      open
      mode="judge-review"
      showId="show-1"
      onClose={vi.fn()}
      review={{ ...REVIEW, judgeKey }}
    />
  );
}

describe('judge review packet panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.printIframeAndWait.mockResolvedValue(true);
    mocks.getClassScoreAudits.mockResolvedValue(new Map());
  });

  it("opens on the judge it was opened for and reads the history of only the judges' classes", async () => {
    renderPanel('judge:id-Pat');

    expect(await screen.findByText(/one results page per class/)).toBeInTheDocument();
    expect(screen.getByText('Pat', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pat\s*2 classes/ })).toHaveAttribute(
      'aria-current',
      'true'
    );
    expect(screen.getByText('2 classes · 2 pages to initial')).toBeInTheDocument();
    expect(mocks.getClassScoreAudits).toHaveBeenCalledWith(['interior', 'exterior', 'container']);
  });

  it("prints one judge's packet without recording anything as printed", async () => {
    const user = userEvent.setup();
    renderPanel('judge:id-Sam');

    const print = await screen.findByRole('button', { name: "Print Sam's results" });
    await waitFor(() => expect(print).toBeEnabled(), BUILT);
    await user.click(print);

    expect(mocks.printIframeAndWait).toHaveBeenCalledTimes(1);
  });

  it('lets the secretary switch to every judge', async () => {
    const user = userEvent.setup();
    renderPanel('judge:id-Sam');

    await user.click(await screen.findByRole('button', { name: /Every judge/ }));

    expect(screen.getByRole('button', { name: 'Print all 2 packets' })).toBeInTheDocument();
  });

  it('still prints when the score history cannot be read, and says changed scores are not marked', async () => {
    mocks.getClassScoreAudits.mockRejectedValue(new Error('offline'));
    renderPanel(null);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'scores changed after a judge submitted them are not marked'
    );
    const print = await screen.findByRole('button', { name: 'Print all 2 packets' });
    await waitFor(() => expect(print).toBeEnabled(), BUILT);
  });

  it('says so when a judge is still judging', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:review');
    URL.revokeObjectURL = vi.fn();
    render(
      <TrialPacketPanel
        open
        mode="judge-review"
        showId="show-1"
        onClose={vi.fn()}
        review={{ ...REVIEW, rows: [row('a', 'Pat', { runFinished: false })], judgeKey: null }}
      />
    );

    expect(await screen.findByText(/Pat has classes still running/)).toBeInTheDocument();
  });
});
