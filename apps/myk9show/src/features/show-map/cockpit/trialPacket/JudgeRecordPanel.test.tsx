import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onlineManager } from '@tanstack/react-query';

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
    judgeSignedOffAt: '2026-12-07T21:00:00Z',
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

function renderPanel(rows: ResultsClassRow[], judgeKey = 'judge:id-Pat') {
  URL.createObjectURL = vi.fn(() => 'blob:record');
  URL.revokeObjectURL = vi.fn();
  render(
    <TrialPacketPanel
      open
      mode="judge-record"
      showId="show-1"
      onClose={vi.fn()}
      record={{
        rows,
        entries: [],
        showName: 'Winter Trial',
        timeZone: 'America/Los_Angeles',
        judgeKey,
        day: '2026-12-07',
      }}
    />
  );
}

describe("judge's record panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.printIframeAndWait.mockResolvedValue(true);
    mocks.getClassScoreAudits.mockResolvedValue(new Map());
    onlineManager.setOnline(true);
  });

  it("prints and saves a judge's record", async () => {
    renderPanel([row('a', 'Pat'), row('b', 'Sam')]);

    const print = await screen.findByRole('button', { name: "Print Pat's record" });
    await waitFor(() => expect(print).toBeEnabled(), BUILT);
    expect(screen.getByRole('button', { name: 'Save as PDF' })).toBeEnabled();
  });

  it('builds the record with the network offline, saying the score history is not available', async () => {
    onlineManager.setOnline(false);
    mocks.getClassScoreAudits.mockImplementation(() => new Promise(() => {}));
    renderPanel([row('a', 'Pat')]);

    expect(
      await screen.findByText(/You are offline, so the score history is not available/)
    ).toBeInTheDocument();
    expect(mocks.getClassScoreAudits).not.toHaveBeenCalled();
    const print = await screen.findByRole('button', { name: "Print Pat's record" });
    await waitFor(() => expect(print).toBeEnabled(), BUILT);
    expect(screen.getByRole('button', { name: 'Save as PDF' })).toBeEnabled();
  });

  it('still builds when the score history fails, and offers to try again', async () => {
    mocks.getClassScoreAudits.mockRejectedValue(new Error('boom'));
    renderPanel([row('a', 'Pat')]);

    expect(await screen.findByText(/The score history could not be read/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    const print = await screen.findByRole('button', { name: "Print Pat's record" });
    await waitFor(() => expect(print).toBeEnabled(), BUILT);
  });

  it("reminds a UKC secretary about the signed judge's book", async () => {
    renderPanel([row('a', 'Pat', { registryId: 'UKC' })]);

    expect(
      await screen.findByText(
        "UKC: give the judge a copy of the signed judge's book before they leave."
      )
    ).toBeInTheDocument();
  });

  it('says what is missing when the day is not fully initialled, and stays usable', async () => {
    renderPanel([row('a', 'Pat'), row('b', 'Pat', { judgeSignedOffAt: null })]);

    expect(
      await screen.findByText(/Not every class of Pat's day is initialled yet/)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Print Pat's record" })).toBeInTheDocument();
  });
});
