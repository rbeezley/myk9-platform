import { afterEach, describe, expect, it, vi } from 'vitest';
import { notifyUserOfSyncFailure } from './mutation-upload-events';
import type { PendingMutation } from './types';

/**
 * A mutation here has failed permanently (MutationManager gave up on it), so the
 * message says it could not be sent. "Not sent yet" would tell a secretary to wait
 * for a change that will never arrive (MYK9-1927).
 */
describe('notifyUserOfSyncFailure', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function capture(count: number) {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() };
    const failed = Array.from({ length: count }, (_, i) => ({ id: `m${i}` }) as PendingMutation);
    notifyUserOfSyncFailure(logger as never, failed);
    return dispatchEvent.mock.calls[0]?.[0] as CustomEvent<{ message: string }> | undefined;
  }

  it('says one change could not be sent', () => {
    expect(capture(1)?.detail.message).toBe(
      '1 change could not be sent. Please check your connection and try again.'
    );
  });

  it('says several changes could not be sent', () => {
    expect(capture(3)?.detail.message).toBe(
      '3 changes could not be sent. Please check your connection and try again.'
    );
  });

  it('sends nothing when no change failed', () => {
    expect(capture(0)).toBeUndefined();
  });

  // MYK9-2479: the app ships this log line remotely; a desk payment's args must not ride along.
  it('logs which mutations failed, never their payload or RPC args', () => {
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() };
    const payment = {
      id: 'mut-1',
      tableName: 'show_payments',
      operation: 'INSERT',
      failureKind: 'max-retries',
      data: { p_amount: 37.5 },
      rpc: { name: 'record_enrollment_payment', args: { p_amount: 37.5, p_reference: '1042' } },
    } as unknown as PendingMutation;

    notifyUserOfSyncFailure(logger as never, [payment]);

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failed permanently'), [
      { id: 'mut-1', tableName: 'show_payments', operation: 'INSERT', failureKind: 'max-retries' },
    ]);
  });
});
