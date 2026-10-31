// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), sync: vi.fn() }));

vi.mock('@/services/database/supabaseClient', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/services/LoggingService', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/services/replication/sharedMutationManager', () => ({ mutationManager: {} }));
vi.mock('../atShowDataAdapter', () => ({ syncAtShowData: mocks.sync }));
vi.mock('../useQueuedScoresByClass', () => ({ queuedScoreEntryIds: vi.fn() }));

import { isNetworkFailure } from './confirmStaleClass';
import { COMPLETE_STALE_CLASS_TIMEOUT_MS, completeStaleClassRpc } from './completeStaleClassRpc';

describe('completeStaleClassRpc', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.sync.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('gives up on a stalled call so the prompt is not stuck busy', async () => {
    // A request that never answers until it is aborted.
    mocks.rpc.mockReturnValue({
      abortSignal: (signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    });
    const pending = completeStaleClassRpc('show', 'stale', ['a']);
    const caught = pending.catch(err => err);
    await vi.advanceTimersByTimeAsync(COMPLETE_STALE_CLASS_TIMEOUT_MS + 1);

    const err = await caught;
    expect(isNetworkFailure(err)).toBe(true);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it('returns the reply and refreshes the show on success', async () => {
    mocks.rpc.mockReturnValue({
      abortSignal: () => Promise.resolve({ data: { ok: true, marked_count: 2 }, error: null }),
    });
    expect(await completeStaleClassRpc('show', 'stale', ['a', 'b'])).toEqual({
      ok: true,
      markedCount: 2,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('ringside_complete_stale_class', {
      p_class_id: 'stale',
      p_expected_entry_ids: ['a', 'b'],
    });
    expect(mocks.sync).toHaveBeenCalledWith('show');
  });
});
