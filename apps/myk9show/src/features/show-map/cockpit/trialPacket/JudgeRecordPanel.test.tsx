import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { onlineManager } from '@tanstack/react-query';

import type { ResultsClassRow } from '@/features/results-tab/buildResultsClassRows';
import { act, render, screen, waitFor } from '@/test/utils/testUtils';

const mocks = vi.hoisted(() => ({
  printIframeAndWait: vi.fn(),
  getClassScoreAudits: vi.fn(),
  previewJudgeRecipient: vi.fn(),
  emailJudgeRecord: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('@/pages/secretary/ReportsPage/reportPreviewUtils', () => ({
  printIframeAndWait: mocks.printIframeAndWait,
}));
vi.mock('@/services/database/entries/scoreAudit', () => ({
  getClassScoreAudits: mocks.getClassScoreAudits,
}));

vi.mock('./emailJudgeRecord', async importOriginal => ({
  ...(await importOriginal<typeof import('./emailJudgeRecord')>()),
  previewJudgeRecipient: mocks.previewJudgeRecipient,
  emailJudgeRecord: mocks.emailJudgeRecord,
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
    mocks.previewJudgeRecipient.mockResolvedValue({
      judgeName: 'Pat',
      email: 'pat@example.com',
      reason: null,
      lastSentAt: null,
    });
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

  it('shows who receives it before anything is sent, then sends only after the press', async () => {
    const user = userEvent.setup();
    mocks.emailJudgeRecord.mockResolvedValue({
      judgeName: 'Pat',
      email: 'pat@example.com',
      alreadySent: false,
      sentAt: null,
      linkExpiresAt: '2027-01-06T00:00:00.000Z',
    });
    renderPanel([row('a', 'Pat'), row('b', 'Sam')]);

    expect(await screen.findByText('pat@example.com')).toBeInTheDocument();
    expect(mocks.emailJudgeRecord).not.toHaveBeenCalled();
    expect(mocks.previewJudgeRecipient).toHaveBeenCalledWith({
      showId: 'show-1',
      judgeId: 'id-Pat',
      day: '2026-12-07',
    });

    const send = await screen.findByRole('button', { name: 'Email the judge their record' });
    await waitFor(() => expect(send).toBeEnabled(), BUILT);
    await user.click(send);

    expect(mocks.emailJudgeRecord).toHaveBeenCalledWith(
      expect.objectContaining({ showId: 'show-1', judgeId: 'id-Pat', day: '2026-12-07' })
    );
    expect(mocks.emailJudgeRecord).not.toHaveBeenCalledWith(
      expect.objectContaining({ sendAgain: true })
    );
    expect(await screen.findByText(/Emailed on [A-Z][a-z]+ \d+ at /)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send again' })).toBeInTheDocument();
  });

  it('says when it already went and offers an explicit Send again, every time', async () => {
    const user = userEvent.setup();
    mocks.previewJudgeRecipient.mockResolvedValue({
      judgeName: 'Pat',
      email: 'pat@example.com',
      reason: null,
      lastSentAt: '2026-12-07T19:05:00.000Z',
    });
    mocks.emailJudgeRecord.mockResolvedValue({
      judgeName: 'Pat',
      email: 'pat@example.com',
      alreadySent: false,
      sentAt: null,
      linkExpiresAt: '2027-01-06T00:00:00.000Z',
    });
    renderPanel([row('a', 'Pat')]);

    expect(await screen.findByText(/Emailed on December 7 at 11:05 AM to/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Email the judge their record' })).toBeNull();
    const again = await screen.findByRole('button', { name: 'Send again' });
    await waitFor(() => expect(again).toBeEnabled(), BUILT);
    expect(mocks.emailJudgeRecord).not.toHaveBeenCalled();

    await user.click(again);
    await waitFor(() => expect(again).toBeEnabled());
    await user.click(again);
    expect(mocks.emailJudgeRecord).toHaveBeenCalledTimes(2);
    expect(mocks.emailJudgeRecord).toHaveBeenLastCalledWith(
      expect.objectContaining({ judgeId: 'id-Pat', sendAgain: true })
    );
  });

  it('offers the PDF and no email for a judge with no email on file', async () => {
    mocks.previewJudgeRecipient.mockResolvedValue({
      judgeName: 'Pat',
      email: null,
      reason: 'no_email',
      lastSentAt: null,
    });
    renderPanel([row('a', 'Pat')]);

    expect(await screen.findByText(/Pat has no email on file/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Email the judge their record' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send again' })).toBeNull();
    const save = screen.getByRole('button', { name: 'Save as PDF' });
    await waitFor(() => expect(save).toBeEnabled(), BUILT);
  });

  it('still prints when the recipient cannot be checked', async () => {
    mocks.previewJudgeRecipient.mockRejectedValue(new Error('offline'));
    renderPanel([row('a', 'Pat')]);

    expect(await screen.findByText(/email could not be checked/)).toBeInTheDocument();
    const print = await screen.findByRole('button', { name: "Print Pat's record" });
    await waitFor(() => expect(print).toBeEnabled(), BUILT);
  });

  it('sends once when the button is pressed twice before the first request settles', async () => {
    let finish: (value: unknown) => void = () => undefined;
    mocks.previewJudgeRecipient.mockResolvedValue({
      judgeName: 'Pat',
      email: 'pat@example.com',
      reason: null,
      lastSentAt: '2026-12-07T19:05:00.000Z',
    });
    mocks.emailJudgeRecord.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    renderPanel([row('a', 'Pat')]);

    const again = await screen.findByRole('button', { name: 'Send again' });
    await waitFor(() => expect(again).toBeEnabled(), BUILT);
    act(() => {
      again.click();
      again.click();
    });
    expect(mocks.emailJudgeRecord).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({ judgeName: 'Pat', email: 'pat@example.com', alreadySent: false, sentAt: null });
    });
  });

  it('says emailing needs a connection when offline, and disables the button', async () => {
    onlineManager.setOnline(false);
    mocks.previewJudgeRecipient.mockResolvedValue({
      judgeName: 'Pat',
      email: 'pat@example.com',
      reason: null,
      lastSentAt: null,
    });
    renderPanel([row('a', 'Pat')]);

    expect(
      await screen.findByText('Emailing needs a connection. You can still print or save the PDF.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/Checking the judge/)).toBeNull();
    const print = await screen.findByRole('button', { name: "Print Pat's record" });
    await waitFor(() => expect(print).toBeEnabled(), BUILT);
  });
});
