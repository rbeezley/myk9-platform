import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';

import { render } from '@/test/utils/testUtils';
import {
  SENT_CHECK_DEBOUNCE_MS,
  SENT_CHECK_MAX_WAIT_MS,
  SENT_CHECK_REFETCH_MS,
  useResultsSentCheck,
} from '../useResultsSentCheck';

const mocks = vi.hoisted(() => ({
  getChanges: vi.fn(),
  unsynced: vi.fn(),
  notice: { current: () => {} },
  submissions: vi.fn(),
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

const CLASSES = [{ id: 'c1' }];

function Probe({ classes }: { classes: { id: string }[] | null }) {
  const { scoreChanges } = useResultsSentCheck('show-1', classes);
  return <div data-testid="state">{scoreChanges?.status ?? 'none'}</div>;
}

describe('useResultsSentCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getChanges.mockResolvedValue(new Map());
    mocks.unsynced.mockResolvedValue(false);
    mocks.submissions.mockReturnValue([
      { status: 'sent', organization: 'AKC', submitted_at: '2026-11-14T19:40:00Z' },
    ]);
  });

  it('is loading, never an all-clear, while the classes are not ready, and reads nothing', async () => {
    render(<Probe classes={null} />);
    expect(await screen.findByTestId('state')).toHaveTextContent('loading');
    expect(mocks.getChanges).not.toHaveBeenCalled();
  });

  it('reads normally once loaded, including a show with no classes', async () => {
    render(<Probe classes={[]} />);
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('read'));
  });

  it('uses the shared spelling of "sent" to decide there is a file to check', async () => {
    mocks.submissions.mockReturnValue([
      { status: ' SENT ', organization: 'AKC', submitted_at: '2026-11-14T19:40:00Z' },
    ]);
    render(<Probe classes={CLASSES} />);
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('read'));
    expect(mocks.getChanges).toHaveBeenCalledWith('show-1', '2026-11-14T19:40:00.000Z');
  });

  it('shows loading, not the old map, after a queued correction syncs, until the re-read settles', async () => {
    render(<Probe classes={CLASSES} />);
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('read'));

    mocks.unsynced.mockResolvedValue(true);
    act(() => mocks.notice.current());
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('unreadable'), {
      timeout: SENT_CHECK_DEBOUNCE_MS + 2000,
    });

    let settle: (value: Map<string, string>) => void = () => {};
    mocks.getChanges.mockReturnValue(new Promise(done => (settle = done)));
    mocks.unsynced.mockResolvedValue(false);
    act(() => mocks.notice.current());
    await waitFor(() => expect(mocks.getChanges).toHaveBeenCalledTimes(2), {
      timeout: SENT_CHECK_DEBOUNCE_MS + 2000,
    });
    expect(screen.getByTestId('state')).toHaveTextContent('loading');

    await act(async () => settle(new Map([['c1', '2026-11-14T20:00:00Z']])));
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('read'));
  }, 15_000);

  describe('timing', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('a steady stream of notices cannot starve the queue re-check past the max wait', async () => {
      render(<Probe classes={CLASSES} />);
      await act(async () => vi.advanceTimersByTimeAsync(0));
      const before = mocks.unsynced.mock.calls.length;

      // A notice every second, so the 2 s debounce never gets to fire on its own.
      for (let second = 0; second < SENT_CHECK_MAX_WAIT_MS / 1000 - 1; second++) {
        act(() => mocks.notice.current());
        await act(async () => vi.advanceTimersByTimeAsync(1000));
      }
      expect(mocks.unsynced.mock.calls.length).toBe(before);

      act(() => mocks.notice.current());
      await act(async () => vi.advanceTimersByTimeAsync(1000));
      expect(mocks.unsynced.mock.calls.length).toBe(before + 1);
    });

    it('looks at a queue read that failed again on the minute, so it does not stick', async () => {
      mocks.unsynced.mockRejectedValueOnce(new Error('idb'));
      render(<Probe classes={CLASSES} />);
      await act(async () => vi.advanceTimersByTimeAsync(0));
      expect(screen.getByTestId('state')).toHaveTextContent('unreadable');

      await act(async () => vi.advanceTimersByTimeAsync(SENT_CHECK_REFETCH_MS + 100));
      await act(async () => vi.advanceTimersByTimeAsync(100));
      expect(screen.getByTestId('state')).toHaveTextContent('read');
    });
  });
});
