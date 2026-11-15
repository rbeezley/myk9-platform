/**
 * MYK9-1023 / MYK9-2012: the "Saved:" line on the entry list must say where the
 * score lives. Offline or still queued it adds "on this device, not sent yet".
 * Once the server has the same score the note goes, and a brief "Scores sent"
 * toast tells a judge who lost signal that it landed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@/test/utils/testUtils';
import { toast } from 'sonner';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { SavedScoreLine } from './SavedScoreLine';
import { useSavedScoreStore } from './savedScore';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getEntryById: vi.fn(),
    getScoreUploadState: vi.fn(),
    readScoreFromServer: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  },
}));

const scored = {
  id: 'entry-1',
  resultStatus: 'qualified',
  searchTimeSeconds: 30,
  totalFaults: 0,
  scoringCompletedAt: '2026-06-01T12:00:00.000Z',
};

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

const LIST = '/at-show/show-1/class/class-1';

function saveScore(entryId: string) {
  useSavedScoreStore.getState().set({
    entryId,
    dogLabel: '100 Willow',
    resultLabel: 'Qualified',
    timeLabel: '0:04.35',
    listPath: LIST,
    scoreRoute: `${LIST}/score/${entryId}`,
  });
}

function renderLine(initialRoute = LIST) {
  saveScore('entry-1');
  return render(<SavedScoreLine />, { initialRoute });
}

const NOT_SENT = /on this device, not sent yet/i;

describe('SavedScoreLine save state (MYK9-1023, MYK9-2012)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSavedScoreStore.getState().clear();
    vi.mocked(replicatedEntriesTable.getEntryById).mockResolvedValue(scored as never);
    vi.mocked(replicatedEntriesTable.getScoreUploadState).mockResolvedValue('pending');
    vi.mocked(replicatedEntriesTable.readScoreFromServer).mockResolvedValue(null);
  });

  afterEach(() => {
    setOnline(true);
  });

  it('reads "Saved: 100 Willow · Qualified · 0:04.35" with the not-sent note while queued', async () => {
    renderLine();

    const line = await screen.findByTestId('saved-score-line');
    expect(line).toHaveTextContent('Saved: 100 Willow · Qualified · 0:04.35 · on this device');
    expect(line).toHaveTextContent(NOT_SENT);
  });

  it('offline: still says the score is on this device, not sent yet', async () => {
    setOnline(false);
    renderLine();

    expect(await screen.findByText(NOT_SENT)).toBeInTheDocument();
  });

  it('acknowledged by the server: keeps the saved score and drops the not-sent note', async () => {
    vi.mocked(replicatedEntriesTable.getScoreUploadState).mockResolvedValue('uploaded');
    vi.mocked(replicatedEntriesTable.readScoreFromServer).mockResolvedValue(scored as never);
    renderLine();

    const line = await screen.findByTestId('saved-score-line');
    await waitFor(() => expect(line).not.toHaveTextContent(/not sent yet/i));
    expect(line).toHaveTextContent('Saved: 100 Willow · Qualified · 0:04.35');
    expect(screen.getByRole('button', { name: 'Correct' })).toBeInTheDocument();
  });

  it('a different score on the server does not count as sent', async () => {
    vi.mocked(replicatedEntriesTable.getScoreUploadState).mockResolvedValue('uploaded');
    vi.mocked(replicatedEntriesTable.readScoreFromServer).mockResolvedValue({
      ...scored,
      searchTimeSeconds: 65,
      scoringCompletedAt: '2026-06-01T11:00:00.000Z',
    } as never);
    renderLine();

    await waitFor(() => expect(replicatedEntriesTable.readScoreFromServer).toHaveBeenCalled());
    expect(screen.getByTestId('saved-score-line')).toHaveTextContent(NOT_SENT);
  });

  it('a server score that lost an area time does not count as sent', async () => {
    vi.mocked(replicatedEntriesTable.getEntryById).mockResolvedValue({
      ...scored,
      area1_time_seconds: 15,
    } as never);
    vi.mocked(replicatedEntriesTable.getScoreUploadState).mockResolvedValue('uploaded');
    vi.mocked(replicatedEntriesTable.readScoreFromServer).mockResolvedValue({
      ...scored,
      area1_time_seconds: 17,
    } as never);
    renderLine();

    await waitFor(() => expect(replicatedEntriesTable.readScoreFromServer).toHaveBeenCalled());
    expect(screen.getByTestId('saved-score-line')).toHaveTextContent(NOT_SENT);
  });

  it('a failed upload says it could not be sent and needs attention', async () => {
    vi.mocked(replicatedEntriesTable.getScoreUploadState).mockResolvedValue('failed');
    renderLine();

    expect(await screen.findByText(/could not be sent, needs attention/i)).toBeInTheDocument();
    expect(screen.getByTestId('saved-score-line')).not.toHaveTextContent(NOT_SENT);
  });

  it('a matching server score wins over an older failed edit on the entry', async () => {
    vi.mocked(replicatedEntriesTable.getScoreUploadState).mockResolvedValue('failed');
    vi.mocked(replicatedEntriesTable.readScoreFromServer).mockResolvedValue(scored as never);
    renderLine();

    const line = await screen.findByTestId('saved-score-line');
    await waitFor(() => expect(line).not.toHaveTextContent(/could not be sent/i));
    expect(line).not.toHaveTextContent(NOT_SENT);
  });

  it('does not reuse an earlier dog’s server confirmation for the next score', async () => {
    vi.mocked(replicatedEntriesTable.getScoreUploadState).mockImplementation(async id =>
      id === 'entry-1' ? 'uploaded' : 'pending'
    );
    vi.mocked(replicatedEntriesTable.readScoreFromServer).mockResolvedValue(scored as never);
    renderLine();
    await waitFor(() =>
      expect(screen.getByTestId('saved-score-line')).not.toHaveTextContent(/not sent yet/i)
    );

    act(() => saveScore('entry-2'));

    expect(await screen.findByText(NOT_SENT)).toBeInTheDocument();
  });

  it('shows nothing on a different list, or once the line is cleared', async () => {
    renderLine('/at-show/show-1/class/class-9');
    expect(screen.queryByTestId('saved-score-line')).not.toBeInTheDocument();
  });

  it('shows nothing once the judge has opened another dog', async () => {
    renderLine();
    await screen.findByTestId('saved-score-line');

    act(() => useSavedScoreStore.getState().clear());

    expect(screen.queryByTestId('saved-score-line')).not.toBeInTheDocument();
  });

  it('a queued score that later flushes shows a "Scores sent" toast once', async () => {
    setOnline(false);
    renderLine();
    await screen.findByText(NOT_SENT);
    expect(toast.success).not.toHaveBeenCalled();

    setOnline(true);
    vi.mocked(replicatedEntriesTable.getScoreUploadState).mockResolvedValue('uploaded');
    vi.mocked(replicatedEntriesTable.readScoreFromServer).mockResolvedValue(scored as never);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/sent/i));
  });

  it('a score acknowledged on first check does not toast', async () => {
    vi.mocked(replicatedEntriesTable.getScoreUploadState).mockResolvedValue('uploaded');
    vi.mocked(replicatedEntriesTable.readScoreFromServer).mockResolvedValue(scored as never);
    renderLine();

    await waitFor(() =>
      expect(screen.getByTestId('saved-score-line')).not.toHaveTextContent(/not sent yet/i)
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('backs off its server readback while a score stays unconfirmed (battery)', async () => {
    vi.useFakeTimers();
    try {
      renderLine();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      // A flat 3s poll would read the server ~20 times a minute.
      expect(
        vi.mocked(replicatedEntriesTable.readScoreFromServer).mock.calls.length
      ).toBeLessThanOrEqual(6);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not poll the server while the screen is hidden', async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    try {
      renderLine();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(replicatedEntriesTable.readScoreFromServer).not.toHaveBeenCalled();
    } finally {
      visibility.mockRestore();
      vi.useRealTimers();
    }
  });

  it('regaining signal restarts the readback backoff at 3s', async () => {
    vi.useFakeTimers();
    try {
      renderLine();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000); // backoff now at its 30s cap
      });
      const read = vi.mocked(replicatedEntriesTable.readScoreFromServer);
      act(() => {
        window.dispatchEvent(new Event('online'));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      const afterOnline = read.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
      expect(read.mock.calls.length).toBe(afterOnline + 1);
    } finally {
      vi.useRealTimers();
    }
  });
});
