import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { act, render, waitFor } from '@/test/utils/testUtils';
import {
  SCORES_NOT_SENT_TOAST_ID,
  ScoresNotSentNotice,
  withoutRingsideScoreFailures,
} from '../ScoresNotSentNotice';

vi.mock('sonner', async importOriginal => ({
  ...(await importOriginal<typeof import('sonner')>()),
  toast: { error: vi.fn(), dismiss: vi.fn() },
}));

const queue = vi.hoisted(() => ({ failed: [] as unknown[] }));
vi.mock('@/services/replication/sharedMutationManager', () => ({
  mutationManager: {
    getPendingMutationsForTable: vi.fn(async () => []),
    getFailedMutations: vi.fn(async () => queue.failed),
  },
}));
vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    getEntryById: vi.fn(async (id: string) => ({ id, showId: 'show-1' })),
    getEntriesByShow: vi.fn(async () => [
      { id: 'e1', classId: 'c1', showId: 'show-1', armband: '100', dogCallName: 'Willow' },
    ]),
  },
  replicatedClassesTable: { getClassById: vi.fn(async () => null) },
}));

const scoreRpc = { name: 'ringside_update_entry', args: {}, fields: { is_scored: true } };
const refused = (id: string, rowId: string) => ({
  id,
  rowId,
  tableName: 'entries',
  operation: 'UPDATE',
  timestamp: 1,
  status: 'failed',
  failureKind: 'permanent',
  error: 'Non-retryable error: This class is cancelled.',
  rpc: scoreRpc,
});

function fail(mutations: unknown[]) {
  act(() => {
    window.dispatchEvent(
      new CustomEvent('replication:sync-failed', {
        detail: { count: mutations.length, mutations, message: '' },
      })
    );
  });
}

beforeEach(() => {
  queue.failed = [];
  vi.mocked(toast.error).mockClear();
});

describe('ScoresNotSentNotice (MYK9-2011)', () => {
  it('names the dog of a refused score and points to the list', async () => {
    queue.failed = [refused('m1', 'e1')];
    render(<ScoresNotSentNotice />, { initialRoute: '/at-show/show-1' });
    fail(queue.failed);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The score for 100 Willow could not be sent.',
        expect.objectContaining({
          id: SCORES_NOT_SENT_TOAST_ID,
          duration: Infinity,
          action: expect.objectContaining({ label: 'See scores not sent' }),
        })
      )
    );
  });

  it('keeps one notice for four refusals, counting all four', async () => {
    queue.failed = ['e1', 'e2', 'e3', 'e4'].map((rowId, i) => refused(`m${i}`, rowId));
    render(<ScoresNotSentNotice />, { initialRoute: '/at-show/show-1' });
    for (const mutation of queue.failed) fail([mutation]);

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(4));
    for (const [text, options] of vi.mocked(toast.error).mock.calls) {
      expect(text).toBe('4 scores could not be sent.');
      expect(options).toMatchObject({ id: SCORES_NOT_SENT_TOAST_ID });
    }
  });

  it('leaves a replaced judge code to its own screen', async () => {
    queue.failed = [
      { ...refused('m1', 'e1'), error: 'Passcode has been regenerated; re-enter a new code' },
    ];
    render(<ScoresNotSentNotice />, { initialRoute: '/at-show/show-1' });
    fail(queue.failed);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('stays quiet for a failure that is not a score', async () => {
    render(<ScoresNotSentNotice />, { initialRoute: '/at-show/show-1' });
    fail([{ id: 'x', tableName: 'shows', operation: 'UPDATE', error: 'nope' }]);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe('withoutRingsideScoreFailures', () => {
  it('leaves every other failure for the generic toast', () => {
    const show = { id: 's', tableName: 'shows', operation: 'UPDATE' as const };
    const scoreFailure = {
      id: 'm',
      tableName: 'entries',
      operation: 'UPDATE' as const,
      rpc: scoreRpc,
    };
    expect(
      withoutRingsideScoreFailures({ count: 2, mutations: [show, scoreFailure], message: '' })
    ).toEqual({ count: 1, mutations: [show], message: '' });
    expect(
      withoutRingsideScoreFailures({ count: 1, mutations: [scoreFailure], message: '' })
    ).toBeNull();
  });
});
