import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withTimeout,
  withRetry,
  TimeoutError,
  calculateBackoffDelay,
  isRetryableError,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_BACKOFF_BASE_MS,
  MAX_BACKOFF_MS,
  BACKOFF_JITTER,
  TIMEOUT_PRESETS,
  RETRY_PRESETS,
} from './network';

// Suppress logger output during tests
vi.mock('./logger', () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  },
}));

describe('constants', () => {
  it('should export default timeout of 15000ms', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(15000);
  });

  it('should export default max retries of 3', () => {
    expect(DEFAULT_MAX_RETRIES).toBe(3);
  });

  it('should export default backoff base of 1000ms', () => {
    expect(DEFAULT_BACKOFF_BASE_MS).toBe(1000);
  });

  it('should export max backoff of 30000ms', () => {
    expect(MAX_BACKOFF_MS).toBe(30000);
  });

  it('should export jitter of 0.1', () => {
    expect(BACKOFF_JITTER).toBe(0.1);
  });

  it('should have timeout presets', () => {
    expect(TIMEOUT_PRESETS.quick).toBe(5000);
    expect(TIMEOUT_PRESETS.standard).toBe(15000);
    expect(TIMEOUT_PRESETS.bulk).toBe(60000);
    expect(TIMEOUT_PRESETS.long).toBe(120000);
  });

  it('should have retry presets', () => {
    expect(RETRY_PRESETS.quick.maxRetries).toBe(2);
    expect(RETRY_PRESETS.standard.maxRetries).toBe(3);
    expect(RETRY_PRESETS.aggressive.maxRetries).toBe(5);
  });
});

describe('TimeoutError', () => {
  it('should be an instance of Error', () => {
    const err = new TimeoutError('timed out', 5000);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TimeoutError);
  });

  it('should have correct name', () => {
    const err = new TimeoutError('timed out', 5000);
    expect(err.name).toBe('TimeoutError');
  });

  it('should store the timeout value', () => {
    const err = new TimeoutError('timed out', 5000);
    expect(err.timeoutMs).toBe(5000);
  });

  it('should store the message', () => {
    const err = new TimeoutError('op timed out', 3000);
    expect(err.message).toBe('op timed out');
  });
});

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should resolve if promise completes before timeout', async () => {
    const promise = Promise.resolve('success');
    const result = await withTimeout(promise, 5000, 'test');
    expect(result).toBe('success');
  });

  it('should reject with TimeoutError if promise exceeds timeout', async () => {
    const promise = new Promise<string>((resolve) => {
      setTimeout(() => resolve('late'), 10000);
    });

    const resultPromise = withTimeout(promise, 100, 'test op');
    vi.advanceTimersByTime(100);

    await expect(resultPromise).rejects.toThrow(TimeoutError);
    await expect(resultPromise).rejects.toThrow('test op timed out after 100ms');
  });

  it('should use default timeout if not specified', async () => {
    const promise = Promise.resolve('ok');
    const result = await withTimeout(promise);
    expect(result).toBe('ok');
  });

  it('should propagate original error if promise rejects before timeout', async () => {
    const promise = Promise.reject(new Error('original error'));

    await expect(withTimeout(promise, 5000, 'test')).rejects.toThrow('original error');
  });

  it('should accept PromiseLike (thenable) objects', async () => {
    const thenable: PromiseLike<string> = {
      then(resolve: ((value: string) => void) | null | undefined) {
        resolve?.('thenable result');
        return Promise.resolve('thenable result');
      },
    } as PromiseLike<string>;

    const result = await withTimeout(thenable, 5000, 'test');
    expect(result).toBe('thenable result');
  });
});

describe('calculateBackoffDelay', () => {
  it('should return approximately baseDelay for attempt 0', () => {
    const delay = calculateBackoffDelay(0, 1000, 30000);
    // With +/-10% jitter, should be between 900 and 1100
    expect(delay).toBeGreaterThanOrEqual(900);
    expect(delay).toBeLessThanOrEqual(1100);
  });

  it('should double delay for each subsequent attempt', () => {
    // Use Math.random mock to remove jitter
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // jitter = 0

    expect(calculateBackoffDelay(0, 1000, 30000)).toBe(1000);
    expect(calculateBackoffDelay(1, 1000, 30000)).toBe(2000);
    expect(calculateBackoffDelay(2, 1000, 30000)).toBe(4000);
    expect(calculateBackoffDelay(3, 1000, 30000)).toBe(8000);

    vi.restoreAllMocks();
  });

  it('should cap at maxDelay', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const delay = calculateBackoffDelay(10, 1000, 30000);
    expect(delay).toBe(30000);

    vi.restoreAllMocks();
  });

  it('should use default values when not provided', () => {
    const delay = calculateBackoffDelay(0);
    // Default base: 1000, with jitter
    expect(delay).toBeGreaterThanOrEqual(900);
    expect(delay).toBeLessThanOrEqual(1100);
  });
});

describe('isRetryableError', () => {
  it('should return true for TimeoutError', () => {
    expect(isRetryableError(new TimeoutError('timeout', 5000))).toBe(true);
  });

  it('should return true for fetch TypeError', () => {
    expect(isRetryableError(new TypeError('fetch failed'))).toBe(true);
  });

  it('should return true for rate limiting (429)', () => {
    expect(isRetryableError({ message: 'too many requests', code: '429' })).toBe(true);
  });

  it('should return true for rate limit message', () => {
    expect(isRetryableError({ message: 'rate limit exceeded' })).toBe(true);
  });

  it('should return true for server errors (5xx)', () => {
    expect(isRetryableError({ message: 'internal', code: '500' })).toBe(true);
    expect(isRetryableError({ message: 'bad gateway', code: '502' })).toBe(true);
    expect(isRetryableError({ message: 'server error' })).toBe(true);
  });

  it('should return true for connection errors', () => {
    expect(isRetryableError({ message: 'connection refused' })).toBe(true);
    expect(isRetryableError({ message: 'ECONNRESET' })).toBe(true);
    expect(isRetryableError({ message: 'socket hang up' })).toBe(true);
  });

  it('should return true for network errors in generic Error', () => {
    expect(isRetryableError(new Error('network error'))).toBe(true);
    expect(isRetryableError(new Error('connection timeout'))).toBe(true);
    expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
    expect(isRetryableError(new Error('socket closed'))).toBe(true);
  });

  it('should return false for client errors (4xx except 429)', () => {
    expect(isRetryableError({ message: 'not found', code: '404' })).toBe(false);
    expect(isRetryableError({ message: 'unauthorized', code: '401' })).toBe(false);
    expect(isRetryableError({ message: 'forbidden', code: '403' })).toBe(false);
  });

  it('should return false for unknown errors', () => {
    expect(isRetryableError(new Error('something happened'))).toBe(false);
  });

  it('should return false for non-Error primitives', () => {
    expect(isRetryableError('string error')).toBe(false);
    expect(isRetryableError(42)).toBe(false);
    expect(isRetryableError(null)).toBe(false);
  });

  it('should return false for TypeError without fetch', () => {
    expect(isRetryableError(new TypeError('cannot read property'))).toBe(false);
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return result on first successful attempt', async () => {
    const operation = vi.fn().mockResolvedValue('success');
    const resultPromise = withRetry(operation, {
      maxRetries: 3,
      timeoutMs: 5000,
    });
    const result = await resultPromise;
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable error and succeed', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new TimeoutError('timeout', 5000))
      .mockResolvedValueOnce('recovered');

    const resultPromise = withRetry(operation, {
      maxRetries: 3,
      baseDelayMs: 100,
      timeoutMs: 5000,
    });

    // Advance past the backoff delay
    await vi.advanceTimersByTimeAsync(200);

    const result = await resultPromise;
    expect(result).toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should throw immediately for non-retryable error', async () => {
    const operation = vi.fn().mockImplementation(() =>
      Promise.reject(new Error('validation error'))
    );

    await expect(
      withRetry(operation, { maxRetries: 3, timeoutMs: 5000 })
    ).rejects.toThrow('validation error');

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should throw after exhausting all retries', async () => {
    vi.useRealTimers(); // Use real timers for this test to avoid unhandled rejection timing issues

    const operation = vi.fn().mockImplementation(() =>
      Promise.reject(new TimeoutError('timeout', 5000))
    );

    await expect(
      withRetry(operation, {
        maxRetries: 1,
        baseDelayMs: 1, // Minimal delay for fast test
        timeoutMs: 5000,
      })
    ).rejects.toThrow(TimeoutError);

    expect(operation).toHaveBeenCalledTimes(2); // initial + 1 retry

    vi.useFakeTimers(); // Restore for afterEach cleanup
  });

  it('should call onRetry callback', async () => {
    const onRetry = vi.fn();
    const operation = vi.fn()
      .mockRejectedValueOnce(new TimeoutError('timeout', 5000))
      .mockResolvedValueOnce('ok');

    const resultPromise = withRetry(operation, {
      maxRetries: 3,
      baseDelayMs: 10,
      timeoutMs: 5000,
      onRetry,
    });

    await vi.advanceTimersByTimeAsync(200);
    await resultPromise;

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(0, expect.any(TimeoutError));
  });

  it('should use custom shouldRetry function', async () => {
    const customShouldRetry = vi.fn().mockReturnValue(false);
    const operation = vi.fn().mockImplementation(() =>
      Promise.reject(new TimeoutError('timeout', 5000))
    );

    await expect(
      withRetry(operation, {
        maxRetries: 3,
        timeoutMs: 5000,
        shouldRetry: customShouldRetry,
      })
    ).rejects.toThrow(TimeoutError);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(customShouldRetry).toHaveBeenCalledTimes(1);
  });
});
