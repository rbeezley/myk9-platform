import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PendingMutation } from './types';
import { classifyMutationFailure } from './mutation-retry';

function mutation(overrides: Partial<PendingMutation> = {}): PendingMutation {
  return {
    id: overrides.id ?? 'mut-1',
    tableName: overrides.tableName ?? 'entries',
    operation: overrides.operation ?? 'UPDATE',
    rowId: overrides.rowId ?? 'entry-1',
    data: overrides.data ?? { id: overrides.rowId ?? 'entry-1' },
    timestamp: overrides.timestamp ?? 1,
    retries: overrides.retries ?? 0,
    status: overrides.status ?? 'pending',
    error: overrides.error,
    failedAt: overrides.failedAt,
    nextRetryAt: overrides.nextRetryAt,
  };
}

describe('classifyMutationFailure', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('increments retries and schedules nextRetryAt for retryable errors', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const result = classifyMutationFailure({
      mutation: mutation({ retries: 0 }),
      error: new TypeError('fetch failed'),
      maxRetries: 3,
      retryBackoffBase: 10,
      now: 1_000,
    });

    expect(result.message).toBe('fetch failed');
    expect(result.canRetry).toBe(true);
    expect(result.permanentlyFailed).toBe(false);
    expect(result.mutation).toMatchObject({
      retries: 1,
      status: 'pending',
      error: 'fetch failed',
      nextRetryAt: 1_010,
    });
    expect(result.mutation.failedAt).toBeUndefined();
  });

  it('marks retryable errors as failed when max retries are reached', () => {
    const result = classifyMutationFailure({
      mutation: mutation({ retries: 2 }),
      error: new TypeError('fetch failed'),
      maxRetries: 3,
      retryBackoffBase: 10,
      now: 2_000,
    });

    expect(result.canRetry).toBe(true);
    expect(result.permanentlyFailed).toBe(true);
    expect(result.mutation).toMatchObject({
      retries: 3,
      status: 'failed',
      error: 'Max retries exceeded: fetch failed',
      failedAt: 2_000,
    });
    expect(result.mutation.nextRetryAt).toBeUndefined();
  });

  it('marks affirmatively-permanent errors as failed immediately', () => {
    const result = classifyMutationFailure({
      mutation: mutation({ retries: 0 }),
      // RLS / permission denials never succeed on retry → dead-letter at once.
      error: new Error('permission denied for table entries'),
      maxRetries: 3,
      retryBackoffBase: 10,
      now: 3_000,
    });

    expect(result.canRetry).toBe(false);
    expect(result.permanentlyFailed).toBe(true);
    expect(result.mutation).toMatchObject({
      retries: 1,
      status: 'failed',
      error: 'Non-retryable error: permission denied for table entries',
      failedAt: 3_000,
    });
    expect(result.mutation.nextRetryAt).toBeUndefined();
  });

  it('classifies a 42501 dead-letter as an authorization failure', () => {
    const result = classifyMutationFailure({
      mutation: mutation({ retries: 0 }),
      error: {
        code: '42501',
        message: 'not authorized to score this class',
      },
      maxRetries: 3,
      retryBackoffBase: 10,
      now: 3_500,
    });

    expect(result.mutation).toMatchObject({
      status: 'failed',
      failureKind: 'authorization',
    });
  });

  it('FAIL-OPEN: an ambiguous non-Error value is retried, not dead-lettered', () => {
    const result = classifyMutationFailure({
      mutation: mutation(),
      error: 'plain failure',
      maxRetries: 3,
      retryBackoffBase: 10,
      now: 4_000,
    });

    // Message is still stringified safely...
    expect(result.message).toBe('plain failure');
    // ...but an unrecognized error keeps its retry budget so no score is lost.
    expect(result.canRetry).toBe(true);
    expect(result.permanentlyFailed).toBe(false);
    expect(result.mutation.status).toBe('pending');
    expect(result.mutation.error).toBe('plain failure');
    expect(result.mutation.nextRetryAt).toBeGreaterThanOrEqual(4_000);
  });

  it.each([
    ['40001', 'could not serialize access due to concurrent update'],
    ['40P01', 'deadlock detected'],
  ])('retries transient PostgreSQL class-40 error %s', (code, message) => {
    const result = classifyMutationFailure({
      mutation: mutation(),
      error: { code, message },
      maxRetries: 3,
      retryBackoffBase: 10,
      now: 5_000,
    });

    expect(result.canRetry).toBe(true);
    expect(result.permanentlyFailed).toBe(false);
    expect(result.mutation.status).toBe('pending');
  });
});
