import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAccountTodayEntriesSubscriptionRegistry,
  type AccountTodaySubscriptionSource,
} from './accountTodayEntriesSubscriptions';

function source(): AccountTodaySubscriptionSource {
  return { subscribe: vi.fn(() => vi.fn()) };
}

describe('account-today shared replication subscriptions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('shares one non-emitting subscription set across duplicate consumers', () => {
    const sources = [source(), source(), source(), source()];
    const registry = createAccountTodayEntriesSubscriptionRegistry(sources, 100);
    const queryClient = new QueryClient();
    const queryKey = ['account-today-entries', 'user-1'] as const;

    const releaseFirst = registry.retain(queryClient, queryKey);
    const releaseSecond = registry.retain(queryClient, queryKey);

    for (const dependency of sources) {
      expect(dependency.subscribe).toHaveBeenCalledOnce();
      expect(dependency.subscribe).toHaveBeenCalledWith(expect.any(Function), {
        emitCurrent: false,
      });
    }

    releaseFirst();
    for (const dependency of sources) {
      expect(vi.mocked(dependency.subscribe).mock.results[0]?.value).not.toHaveBeenCalled();
    }

    releaseSecond();
    for (const dependency of sources) {
      expect(vi.mocked(dependency.subscribe).mock.results[0]?.value).toHaveBeenCalledOnce();
    }
  });

  it('coalesces actual table changes and cancels pending work on final release', async () => {
    const sources = [source(), source(), source(), source()];
    const registry = createAccountTodayEntriesSubscriptionRegistry(sources, 100);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const queryKey = ['account-today-entries', 'user-1'] as const;
    const release = registry.retain(queryClient, queryKey);
    const callbacks = sources.map(dependency => vi.mocked(dependency.subscribe).mock.calls[0]?.[0]);

    callbacks.forEach(callback => callback?.([]));
    await vi.advanceTimersByTimeAsync(99);
    expect(invalidate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(invalidate).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledWith({ queryKey });

    callbacks[0]?.([]);
    release();
    await vi.advanceTimersByTimeAsync(100);
    expect(invalidate).toHaveBeenCalledOnce();
  });

  it('ignores a table callback that was already queued when the final consumer released', async () => {
    const sources = [source()];
    const registry = createAccountTodayEntriesSubscriptionRegistry(sources, 100);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const release = registry.retain(queryClient, ['account-today-entries', 'user-1']);
    const queuedCallback = vi.mocked(sources[0].subscribe).mock.calls[0]?.[0];

    release();
    queuedCallback?.([]);
    await vi.advanceTimersByTimeAsync(100);

    expect(invalidate).not.toHaveBeenCalled();
  });
});
