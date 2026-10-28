import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PendingMutation } from './types';
import { classifyMutationFailure } from './mutation-retry';
import { MAX_BACKOFF_MS, TimeoutError } from './mutation-utils';

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
      error: { message: 'statement timeout', code: '57014' },
      maxRetries: 3,
      retryBackoffBase: 10,
      now: 1_000,
    });

    expect(result.message).toBe('statement timeout');
    expect(result.canRetry).toBe(true);
    expect(result.permanentlyFailed).toBe(false);
    expect(result.mutation).toMatchObject({
      retries: 1,
      status: 'pending',
      error: 'statement timeout',
      nextRetryAt: 1_010,
    });
    expect(result.mutation.failedAt).toBeUndefined();
  });

  it('marks retryable errors as failed when max retries are reached', () => {
    const result = classifyMutationFailure({
      mutation: mutation({ retries: 2 }),
      error: { message: 'statement timeout', code: '57014' },
      maxRetries: 3,
      retryBackoffBase: 10,
      now: 2_000,
    });

    expect(result.canRetry).toBe(true);
    expect(result.permanentlyFailed).toBe(true);
    expect(result.mutation).toMatchObject({
      retries: 3,
      status: 'failed',
      error: 'Max retries exceeded: statement timeout',
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

  describe('transport loss confirmed by the probe does not spend the retry budget (MYK9-1474)', () => {
    const OUTAGE_MS = 60_000;
    const transportErrors: Array<[string, () => unknown]> = [
      ['a fetch TypeError', () => new TypeError('Failed to fetch')],
      ['a TimeoutError', () => new TimeoutError('timed out', 15_000)],
      ['an AbortError', () => Object.assign(new Error('aborted'), { name: 'AbortError' })],
      [
        'the postgrest-js fetch failure object',
        () => ({ message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' }),
      ],
    ];
    const targets: Array<[string, Partial<PendingMutation>]> = [
      ['a score update', { tableName: 'entries', operation: 'UPDATE' }],
      [
        'a ringside_update_entry rpc',
        { rpc: { name: 'ringside_update_entry', args: {} }, operation: 'UPDATE' },
      ],
      [
        'a set_class_judge rpc',
        { rpc: { name: 'set_class_judge', args: {} }, operation: 'UPDATE' },
      ],
    ];

    // Replays every retry the queue would make across a 60 s outage, then the uplink returns.
    function runOutage(m: PendingMutation, makeError: () => unknown): PendingMutation {
      let current = m;
      let now = 0;
      let attempts = 0;
      while (now < OUTAGE_MS) {
        const result = classifyMutationFailure({
          mutation: current,
          error: makeError(),
          maxRetries: 3,
          retryBackoffBase: 1_000,
          uplinkDown: true,
          now,
        });
        expect(result.permanentlyFailed).toBe(false);
        expect(result.mutation.status).toBe('pending');
        current = result.mutation;
        now = current.nextRetryAt!;
        attempts += 1;
      }
      expect(attempts).toBeGreaterThan(3);
      return current;
    }

    describe.each(targets)('%s', (_label, overrides) => {
      it.each(transportErrors)('stays pending through a 60 s outage of %s', (_n, makeError) => {
        const survivor = runOutage(mutation(overrides), makeError);
        expect(survivor.retries).toBe(0);
        expect(survivor.transportRetries).toBeGreaterThan(3);
      });
    });

    it('parks a postgrest-shaped error that carries a real code at once', () => {
      const result = classifyMutationFailure({
        mutation: mutation(),
        error: { message: 'TypeError: x', details: '', hint: '', code: '42501' },
        maxRetries: 3,
        retryBackoffBase: 10,
        now: 0,
      });
      expect(result.permanentlyFailed).toBe(true);
      expect(result.mutation).toMatchObject({ status: 'failed', failureKind: 'authorization' });
    });

    it('caps the transport backoff at MAX_BACKOFF_MS', () => {
      let current = mutation({ transportRetries: 500 });
      const result = classifyMutationFailure({
        mutation: current,
        error: new TypeError('Failed to fetch'),
        maxRetries: 3,
        retryBackoffBase: 1_000,
        uplinkDown: true,
        now: 0,
      });
      current = result.mutation;
      expect(current.nextRetryAt).toBeLessThanOrEqual(MAX_BACKOFF_MS);
    });

    it('treats a legacy row without transportRetries as zero', () => {
      const result = classifyMutationFailure({
        mutation: mutation({ retries: 1 }),
        error: new TypeError('Failed to fetch'),
        maxRetries: 3,
        retryBackoffBase: 10,
        uplinkDown: true,
        now: 0,
      });
      expect(result.mutation).toMatchObject({ retries: 1, transportRetries: 1, status: 'pending' });
    });

    it.each([
      ['42501', 'permission denied'],
      ['23505', 'duplicate key value'],
      ['MK014', 'entry under a deleted class'],
    ])('parks %s on the first failure', (code, message) => {
      const result = classifyMutationFailure({
        mutation: mutation(),
        error: { code, message },
        maxRetries: 3,
        retryBackoffBase: 10,
        now: 0,
      });
      expect(result.permanentlyFailed).toBe(true);
      expect(result.mutation.status).toBe('failed');
    });

    it('still parks an ambiguous non-transport error (57014) after maxRetries', () => {
      let current = mutation();
      for (let i = 0; i < 3; i += 1) {
        const result = classifyMutationFailure({
          mutation: current,
          error: { code: '57014', message: 'canceling statement due to statement timeout' },
          maxRetries: 3,
          retryBackoffBase: 10,
          now: i,
        });
        current = result.mutation;
        expect(result.permanentlyFailed).toBe(i === 2);
      }
      expect(current).toMatchObject({ status: 'failed', failureKind: 'max-retries', retries: 3 });
    });

    const candidates: Array<[string, unknown]> = [
      ['a timeout', new TimeoutError('timed out', 15_000)],
      [
        'a postgrest-wrapped client bug',
        {
          message: 'TypeError: Cannot read properties of undefined',
          details: '',
          hint: '',
          code: '',
        },
      ],
      ['x.fetch is not a function', new TypeError('x.fetch is not a function')],
    ];

    it.each(candidates)('parks %s after maxRetries when the uplink is reachable', (_n, error) => {
      let current = mutation({ transportRetries: 4 });
      for (let i = 0; i < 3; i += 1) {
        const result = classifyMutationFailure({
          mutation: current,
          error,
          maxRetries: 3,
          retryBackoffBase: 10,
          uplinkDown: false,
          now: i,
        });
        expect(result.permanentlyFailed).toBe(i === 2);
        current = result.mutation;
      }
      expect(current).toMatchObject({ status: 'failed', failureKind: 'max-retries', retries: 3 });
      expect(current.transportRetries).toBeUndefined();
    });

    it('drops transportRetries once a failure spends the budget', () => {
      const result = classifyMutationFailure({
        mutation: mutation({ transportRetries: 7 }),
        error: { message: 'statement timeout', code: '57014' },
        maxRetries: 3,
        retryBackoffBase: 10,
        now: 0,
      });
      expect(result.mutation.status).toBe('pending');
      expect(result.mutation.transportRetries).toBeUndefined();
    });

    it('spends the budget when no connectivity evidence is given', () => {
      const result = classifyMutationFailure({
        mutation: mutation(),
        error: new TypeError('Failed to fetch'),
        maxRetries: 3,
        retryBackoffBase: 10,
        now: 0,
      });
      expect(result.mutation).toMatchObject({ retries: 1 });
      expect(result.mutation.transportRetries).toBeUndefined();
    });
  });
});
