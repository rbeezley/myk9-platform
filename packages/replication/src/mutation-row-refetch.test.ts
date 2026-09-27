import { describe, expect, it, vi } from 'vitest';
import { RowRefetchRegistry } from './mutation-row-refetch';
import { UploadLock } from './upload-lock';

function makeLogger() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeRegistry(logger = makeLogger(), lock = new UploadLock()) {
  return new RowRefetchRegistry(logger, work => lock.run(work));
}

describe('RowRefetchRegistry (MYK9-771)', () => {
  it('returns undefined for a table that registered no refetcher', () => {
    expect(makeRegistry().request('entries', '1')).toBeUndefined();
  });

  it('joins a queued or running re-fetch of the same row instead of starting another', async () => {
    const registry = makeRegistry();
    let release!: () => void;
    const refetch = vi.fn(() => new Promise<void>(resolve => (release = resolve)));
    registry.register('entries', refetch);

    const first = registry.request('entries', '1');
    const second = registry.request('entries', '1');
    expect(second).toBe(first);
    await vi.waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    release();
    await first;

    // Settled: the next rejection starts a fresh fetch.
    const third = registry.request('entries', '1');
    expect(third).not.toBe(first);
    await vi.waitFor(() => expect(refetch).toHaveBeenCalledTimes(2));
    expect(refetch).toHaveBeenCalledWith(['1']);
    release();
    await third;
  });

  it('never rejects: a throwing refetcher is logged and the row can be asked again', async () => {
    const logger = makeLogger();
    const registry = makeRegistry(logger);
    const refetch = vi.fn(() => {
      throw new Error('boom');
    });
    registry.register('entries', refetch);

    await expect(registry.request('entries', '1')).resolves.toBeUndefined();
    await expect(registry.request('entries', '1')).resolves.toBeUndefined();
    expect(refetch).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('a request made while the lock is held queues behind it, without deadlocking', async () => {
    const lock = new UploadLock();
    const registry = makeRegistry(makeLogger(), lock);
    const order: string[] = [];
    registry.register('entries', async () => {
      order.push('refetch');
    });

    // As an upload does: request from INSIDE the held section, never await it there.
    let queued: Promise<void> | undefined;
    await lock.run(async () => {
      order.push('upload start');
      queued = registry.request('entries', '1');
      await new Promise(resolve => setTimeout(resolve, 10));
      order.push('upload end');
    });
    await queued;

    expect(order).toEqual(['upload start', 'upload end', 'refetch']);
  });

  it('unregister removes only the refetcher it registered', () => {
    const registry = makeRegistry();
    const unregisterOld = registry.register(
      'entries',
      vi.fn(async () => undefined)
    );
    registry.register(
      'entries',
      vi.fn(async () => undefined)
    );

    unregisterOld();

    expect(registry.request('entries', '1')).toBeDefined();
  });
});

describe('UploadLock in-tab fallback', () => {
  it('runs a callback synchronously when free, and one at a time in FIFO order', async () => {
    const lock = new UploadLock();
    const order: string[] = [];
    let releaseFirst!: () => void;

    const first = lock.run(async () => {
      order.push('first');
      await new Promise<void>(resolve => (releaseFirst = resolve));
    });
    expect(order).toEqual(['first']);
    const second = lock.run(async () => {
      order.push('second');
    });
    const third = lock.run(async () => {
      order.push('third');
    });
    await Promise.resolve();
    expect(order).toEqual(['first']);

    releaseFirst();
    await Promise.all([first, second, third]);
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('releases the lock when a callback throws or rejects', async () => {
    const lock = new UploadLock();
    await expect(
      lock.run(() => {
        throw new Error('sync');
      })
    ).rejects.toThrow('sync');
    await expect(lock.run(() => Promise.reject(new Error('async')))).rejects.toThrow('async');
    await expect(lock.run(async () => 'free')).resolves.toBe('free');
  });

  it('uses the replication-upload Web Lock when the browser has one', async () => {
    const request = vi.fn((_name: string, callback: () => Promise<unknown>) => callback());
    vi.stubGlobal('navigator', { locks: { request } });
    try {
      const lock = new UploadLock();
      expect(lock.isCrossTab()).toBe(true);
      await expect(lock.run(async () => 'held')).resolves.toBe('held');
      expect(request).toHaveBeenCalledWith('replication-upload', expect.any(Function));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
