import { describe, it, expect, vi } from 'vitest';
import { RowLockRegistry } from './RowLockRegistry';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('RowLockRegistry', () => {
  it('runs a single call for a given id and returns its result', async () => {
    const registry = new RowLockRegistry();
    const result = await registry.withRowLock('row-1', async () => 'done');

    expect(result).toBe('done');
  });

  it('serializes concurrent calls for the same id (no overlap)', async () => {
    const registry = new RowLockRegistry();
    const order: string[] = [];
    const first = deferred<void>();

    const call1 = registry.withRowLock('row-1', async () => {
      order.push('call1-start');
      await first.promise;
      order.push('call1-end');
      return 1;
    });

    // Give call1 a chance to acquire the lock first.
    await Promise.resolve();

    const call2 = registry.withRowLock('row-1', async () => {
      order.push('call2-start');
      return 2;
    });

    // call2 must not have started yet — call1 still holds the lock.
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['call1-start']);

    first.resolve();
    const [result1, result2] = await Promise.all([call1, call2]);

    expect(order).toEqual(['call1-start', 'call1-end', 'call2-start']);
    expect(result1).toBe(1);
    expect(result2).toBe(2);
  });

  it('allows concurrent calls for different ids to run in parallel', async () => {
    const registry = new RowLockRegistry();
    const order: string[] = [];
    const rowADeferred = deferred<void>();

    const callA = registry.withRowLock('row-A', async () => {
      order.push('A-start');
      await rowADeferred.promise;
      order.push('A-end');
    });

    await Promise.resolve();

    const callB = registry.withRowLock('row-B', async () => {
      order.push('B-start');
      order.push('B-end');
    });

    await callB;
    // row-B ran to completion while row-A was still awaiting its deferred.
    expect(order).toEqual(['A-start', 'B-start', 'B-end']);

    rowADeferred.resolve();
    await callA;
    expect(order).toEqual(['A-start', 'B-start', 'B-end', 'A-end']);
  });

  it('releases the lock even when the wrapped function throws, so later calls are not deadlocked', async () => {
    const registry = new RowLockRegistry();

    await expect(
      registry.withRowLock('row-1', async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    // A subsequent call for the same id must not hang.
    const result = await registry.withRowLock('row-1', async () => 'recovered');
    expect(result).toBe('recovered');
  });

  it('processes queued calls for the same id in FIFO order', async () => {
    const registry = new RowLockRegistry();
    const completionOrder: number[] = [];
    const fn = vi.fn(async (n: number) => {
      completionOrder.push(n);
    });

    await Promise.all([
      registry.withRowLock('row-1', () => fn(1)),
      registry.withRowLock('row-1', () => fn(2)),
      registry.withRowLock('row-1', () => fn(3)),
    ]);

    expect(completionOrder).toEqual([1, 2, 3]);
  });
});
