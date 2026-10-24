import { afterEach, describe, expect, it, vi } from 'vitest';
import { readDeadlineReason } from '@/services/database/readDeadlineFetch';
import {
  createAppQueryClient,
  READ_DEADLINE_RETRIES,
  READ_DEADLINE_RETRY_BASE_MS,
  READ_DEADLINE_RETRY_JITTER_MS,
} from './queryClient';

type RetryFn = (failureCount: number, error: unknown) => boolean;
type RetryDelayFn = (attemptIndex: number, error: unknown) => number;

function retryOptions() {
  const queries = createAppQueryClient().getDefaultOptions().queries ?? {};
  return { retry: queries.retry as RetryFn, retryDelay: queries.retryDelay as RetryDelayFn };
}

/**
 * MYK9-1374: a read the 30 s Supabase deadline aborted is still running on the
 * server, so the query layer retries it once, later, instead of twice at once.
 */
describe('query retries after a read-deadline timeout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retries a server error twice, half a second apart and doubling', () => {
    const { retry, retryDelay } = retryOptions();
    const serverError = Object.assign(new Error('Internal Server Error'), { status: 500 });
    expect(retry(0, serverError)).toBe(true);
    expect(retry(1, serverError)).toBe(true);
    expect(retry(2, serverError)).toBe(false);
    expect(retryDelay(0, serverError)).toBe(500);
    expect(retryDelay(1, serverError)).toBe(1000);
  });

  it('retries a deadline timeout once, between 10 and 15 seconds later', () => {
    const { retry, retryDelay } = retryOptions();
    const timeout = readDeadlineReason();
    const rethrown = new Error(`TimeoutError: ${timeout.message}`);
    for (const error of [timeout, rethrown]) {
      expect(retry(0, error)).toBe(true);
      expect(retry(READ_DEADLINE_RETRIES, error)).toBe(false);
      const delay = retryDelay(0, error);
      expect(delay).toBeGreaterThanOrEqual(READ_DEADLINE_RETRY_BASE_MS);
      expect(delay).toBeLessThan(READ_DEADLINE_RETRY_BASE_MS + READ_DEADLINE_RETRY_JITTER_MS);
    }
    expect(READ_DEADLINE_RETRIES).toBe(1);
  });

  it('spreads the retry with jitter so a page of queries does not retry in step', () => {
    const { retryDelay } = retryOptions();
    const timeout = readDeadlineReason();
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.999);
    expect(retryDelay(0, timeout)).toBe(READ_DEADLINE_RETRY_BASE_MS);
    expect(retryDelay(0, timeout)).toBe(
      READ_DEADLINE_RETRY_BASE_MS + Math.floor(0.999 * READ_DEADLINE_RETRY_JITTER_MS)
    );
  });

  it('still refuses to retry a 4xx, deadline or not', () => {
    const { retry } = retryOptions();
    expect(retry(0, Object.assign(new Error('Forbidden'), { status: 403 }))).toBe(false);
  });
});
