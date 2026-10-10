/**
 * MYK9-1023 — the post-score confirmation must say where the score lives.
 * Offline (or still queued): "on this device, will send when back online".
 * Acknowledged by the server: "Score saved", plus a brief "Scores sent" toast
 * when a queued score later flushes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@/test/utils/testUtils';
import { toast } from 'sonner';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { QuickAdvancePanel } from './quickAdvancePanel';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getEntriesByClass: vi.fn().mockResolvedValue([]),
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

function renderPanel() {
  return render(
    <QuickAdvancePanel
      classId="class-1"
      scoredEntryId="entry-1"
      onBackToList={vi.fn()}
      onCorrectScore={vi.fn()}
      onPickEntry={vi.fn()}
    />
  );
}

describe('QuickAdvancePanel score save state (MYK9-1023)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(replicatedEntriesTable.getEntryById).mockResolvedValue(scored as never);
    vi.mocked(replicatedEntriesTable.getScoreUploadState).mockResolvedValue('pending');
    vi.mocked(replicatedEntriesTable.readScoreFromServer).mockResolvedValue(null);
  });

  afterEach(() => {
    setOnline(true);
  });

  it('offline: says the score is on this device and will send when back online', async () => {
    setOnline(false);
    renderPanel();

    expect(
      await screen.findByText(/Saved on this device.*will send when you.re back online/i)
    ).toBeInTheDocument();
    expect(screen.queryByText('Score saved')).not.toBeInTheDocument();
  });

  it('online and acknowledged: says "Score saved"', async () => {
    vi.mocked(replicatedEntriesTable.getScoreUploadState).mockResolvedValue('uploaded');
    vi.mocked(replicatedEntriesTable.readScoreFromServer).mockResolvedValue(scored as never);
    renderPanel();

    expect(await screen.findByText('Score saved')).toBeInTheDocument();
    expect(screen.queryByText(/on this device/i)).not.toBeInTheDocument();
  });

  it('a queued score that later flushes shows a "Scores sent" toast once', async () => {
    setOnline(false);
    renderPanel();
    await screen.findByText(/will send when you.re back online/i);
    expect(toast.success).not.toHaveBeenCalled();

    setOnline(true);
    vi.mocked(replicatedEntriesTable.getScoreUploadState).mockResolvedValue('uploaded');
    vi.mocked(replicatedEntriesTable.readScoreFromServer).mockResolvedValue(scored as never);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(await screen.findByText('Score saved')).toBeInTheDocument();
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/sent/i));
  });

  it('a score acknowledged on first check does not toast', async () => {
    vi.mocked(replicatedEntriesTable.getScoreUploadState).mockResolvedValue('uploaded');
    vi.mocked(replicatedEntriesTable.readScoreFromServer).mockResolvedValue(scored as never);
    renderPanel();

    await screen.findByText('Score saved');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('backs off its server readback while a score stays unconfirmed (battery)', async () => {
    vi.useFakeTimers();
    try {
      renderPanel();
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
      renderPanel();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(replicatedEntriesTable.readScoreFromServer).not.toHaveBeenCalled();
    } finally {
      visibility.mockRestore();
      vi.useRealTimers();
    }
  });
});
