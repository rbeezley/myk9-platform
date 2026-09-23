import { describe, expect, it, vi } from 'vitest';
import {
  isTransientSettlementSqlError,
  retryTransientSettlement,
} from './transientSettlementRetry';

describe('transient settlement retries', () => {
  it('retries deadlocks and serialization failures, but no other errors', async () => {
    expect(isTransientSettlementSqlError('40P01')).toBe(true);
    expect(isTransientSettlementSqlError('40001')).toBe(true);
    expect(isTransientSettlementSqlError('23514')).toBe(false);
    expect(isTransientSettlementSqlError(undefined)).toBe(false);
  });

  it('retries aborted transactions with bounded backoff and returns the successful result', async () => {
    const delays: number[] = [];
    const wait = async (milliseconds: number) => {
      delays.push(milliseconds);
    };
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: '40P01' } })
      .mockResolvedValueOnce({ data: null, error: { code: '40001' } })
      .mockResolvedValueOnce({ data: { order_id: 'order-1' }, error: null });

    await expect(retryTransientSettlement(invoke, { wait })).resolves.toEqual({
      data: { order_id: 'order-1' },
      error: null,
    });
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([100, 200]);
  });

  it('stops after three transient aborts and returns the last error for manual recovery', async () => {
    const delays: number[] = [];
    const wait = async (milliseconds: number) => {
      delays.push(milliseconds);
    };
    const invoke = vi.fn(async () => ({ data: null, error: { code: '40P01' } }));

    await expect(retryTransientSettlement(invoke, { wait })).resolves.toEqual({
      data: null,
      error: { code: '40P01' },
    });
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(delays).toHaveLength(2);
  });
});
