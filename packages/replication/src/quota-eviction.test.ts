import { describe, expect, it, vi } from 'vitest';
import type { Logger } from './dependencies';
import { isQuotaExceededError, withQuotaEviction } from './quota-eviction';

const silentLogger: Logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

/** Build a DOMException-like error without depending on the runtime's DOMException. */
function domError(name: string, message: string): Error {
  const err = new Error(message);
  err.name = name;
  return err;
}

describe('isQuotaExceededError', () => {
  it('matches a direct QuotaExceededError', () => {
    expect(isQuotaExceededError(domError('QuotaExceededError', 'quota'))).toBe(true);
  });

  it('matches the idb aborted-transaction shape (AbortError: QuotaExceededError)', () => {
    // This is the exact production signature: name AbortError, message names the quota error.
    expect(isQuotaExceededError(domError('AbortError', 'QuotaExceededError'))).toBe(true);
  });

  it('matches legacy Firefox numeric codes', () => {
    expect(isQuotaExceededError({ code: 22 })).toBe(true);
    expect(isQuotaExceededError({ code: 1014 })).toBe(true);
  });

  it('does NOT match an unrelated AbortError (genuine cancellation)', () => {
    expect(isQuotaExceededError(domError('AbortError', 'The user aborted a request'))).toBe(false);
  });

  it('does NOT match arbitrary errors, null, or primitives', () => {
    expect(isQuotaExceededError(new Error('boom'))).toBe(false);
    expect(isQuotaExceededError(null)).toBe(false);
    expect(isQuotaExceededError('QuotaExceededError')).toBe(false);
    expect(isQuotaExceededError(undefined)).toBe(false);
  });
});

describe('withQuotaEviction', () => {
  it('returns the write result without evicting when the write succeeds', async () => {
    const evict = vi.fn(async () => 0);
    const result = await withQuotaEviction(async () => 'ok', evict, silentLogger);

    expect(result).toBe('ok');
    expect(evict).not.toHaveBeenCalled();
  });

  it('rethrows a non-quota error without evicting', async () => {
    const evict = vi.fn(async () => 0);
    const write = vi.fn(async () => {
      throw new Error('not a quota problem');
    });

    await expect(withQuotaEviction(write, evict, silentLogger)).rejects.toThrow(
      'not a quota problem'
    );
    expect(evict).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('evicts then retries once on a quota error, returning the retry result', async () => {
    const evict = vi.fn(async () => 5);
    let attempts = 0;
    const write = vi.fn(async () => {
      attempts++;
      if (attempts === 1) throw domError('AbortError', 'QuotaExceededError');
      return 'recovered';
    });

    const result = await withQuotaEviction(write, evict, silentLogger);

    expect(result).toBe('recovered');
    expect(evict).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('does not retry when eviction frees no rows — rethrows the original error', async () => {
    const evict = vi.fn(async () => 0);
    const write = vi.fn(async () => {
      throw domError('QuotaExceededError', 'quota');
    });

    await expect(withQuotaEviction(write, evict, silentLogger)).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
    expect(evict).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1); // no retry
  });

  it('surfaces the original quota error if eviction itself throws', async () => {
    const evict = vi.fn(async () => {
      throw new Error('eviction blew up');
    });
    const write = vi.fn(async () => {
      throw domError('QuotaExceededError', 'quota');
    });

    await expect(withQuotaEviction(write, evict, silentLogger)).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('rethrows if the retry also fails with a quota error', async () => {
    const evict = vi.fn(async () => 3);
    const write = vi.fn(async () => {
      throw domError('QuotaExceededError', 'quota');
    });

    await expect(withQuotaEviction(write, evict, silentLogger)).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
    // First attempt + one retry after eviction.
    expect(write).toHaveBeenCalledTimes(2);
    expect(evict).toHaveBeenCalledTimes(1);
  });
});
