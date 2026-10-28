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
    ...(overrides.rpc && { rpc: overrides.rpc }),
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

  it.each([
    ['a plain error object', { message: 'boom', code: 'XX000' }, 'boom'],
    ['a TypeError from an aborted fetch', new TypeError('Failed to fetch'), 'Failed to fetch'],
    ['a bare string', 'plain text', 'plain text'],
    [
      'an object with no message',
      { code: 'XX000', details: 'deadlock detected' },
      'deadlock detected',
    ],
    ['an object with nothing readable', {}, 'Unknown error'],
  ])('records a readable message for %s, never [object Object]', (_label, error, expected) => {
    const result = classifyMutationFailure({
      mutation: mutation(),
      error,
      maxRetries: 1,
      retryBackoffBase: 10,
      now: 1_000,
    });

    expect(result.message).toBe(expected);
    expect(result.mutation.error).toContain(expected);
    expect(result.mutation.error).not.toContain('[object Object]');
  });

  describe('RPC-scoped permanent codes (MYK9-1327)', () => {
    const classify = (rpcName: string, code: string) =>
      classifyMutationFailure({
        mutation: mutation({ rpc: { name: rpcName, args: {} } }),
        error: { message: 'raised', code },
        maxRetries: 3,
        retryBackoffBase: 10,
        now: 1_000,
      });

    it.each(['P0002', '22023'])('parks a set_class_judge on %s', code => {
      const result = classify('set_class_judge', code);
      expect(result.permanentlyFailed).toBe(true);
      expect(result.mutation).toMatchObject({ status: 'failed', failureKind: 'permanent' });
    });

    it('backs a ringside_update_entry off on P0002 instead of dead-lettering the score', () => {
      const result = classify('ringside_update_entry', 'P0002');
      expect(result.permanentlyFailed).toBe(false);
      expect(result.mutation.status).toBe('pending');
      expect(result.mutation.nextRetryAt).toBeGreaterThan(1_000);
    });

    it('backs a plain UPDATE off on 22023', () => {
      const result = classifyMutationFailure({
        mutation: mutation(),
        error: { message: 'bad', code: '22023' },
        maxRetries: 3,
        retryBackoffBase: 10,
        now: 1_000,
      });
      expect(result.permanentlyFailed).toBe(false);
    });
  });
});
