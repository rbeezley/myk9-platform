import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acquireCacheClearWriteLock,
  acquireCacheClearWriteLockSync,
  beginCacheClear,
  withCacheClearLock,
} from './cacheClearGate';

describe('cache clear gate', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('waits for an in-flight writer before allowing cache clearing', async () => {
    const releaseWriter = acquireCacheClearWriteLockSync();
    const cacheClear = beginCacheClear();
    expect(cacheClear).not.toBeNull();

    let drained = false;
    const wait = cacheClear!.waitForWriters().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);

    releaseWriter();
    await wait;
    expect(drained).toBe(true);

    cacheClear!.release();
  });

  it('rejects new writers while cache clearing is in progress', () => {
    const cacheClear = beginCacheClear();
    expect(cacheClear).not.toBeNull();
    expect(() => acquireCacheClearWriteLockSync()).toThrow('Cache clearing is in progress');
    cacheClear!.release();
    const releaseWriter = acquireCacheClearWriteLockSync();
    releaseWriter();
  });

  it('uses an atomic exclusive Web Lock when the browser provides one', async () => {
    const request = vi.fn(
      async (_name: string, _options: unknown, callback: (lock: object) => unknown) => callback({})
    );
    const previousDescriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request },
    });

    try {
      await expect(withCacheClearLock(() => 'cleared')).resolves.toBe('cleared');
      expect(request).toHaveBeenCalledWith(
        'myk9-cache-clear-lock',
        { mode: 'exclusive', ifAvailable: true },
        expect.any(Function)
      );
    } finally {
      if (previousDescriptor) {
        Object.defineProperty(navigator, 'locks', previousDescriptor);
      } else {
        Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
      }
    }
  });

  it('holds a shared Web Lock until the writer releases it', async () => {
    const request = vi.fn(
      async (
        _name: string,
        options: { mode: string },
        callback: (lock: object) => Promise<unknown>
      ) => {
        expect(options).toEqual({ mode: 'shared' });
        return callback({});
      }
    );
    const previousDescriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request },
    });

    try {
      const release = await acquireCacheClearWriteLock();
      const requestFinished = request.mock.results[0]?.value as Promise<unknown>;
      expect(requestFinished).toBeInstanceOf(Promise);
      release();
      await requestFinished;
    } finally {
      if (previousDescriptor) {
        Object.defineProperty(navigator, 'locks', previousDescriptor);
      } else {
        Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
      }
    }
  });
});
