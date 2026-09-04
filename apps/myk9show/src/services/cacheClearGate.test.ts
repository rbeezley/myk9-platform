import { beforeEach, describe, expect, it, vi } from 'vitest';
import { acquireCacheClearWriteLock, beginCacheClear, withCacheClearLock } from './cacheClearGate';

describe('cache clear gate', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('waits for an in-flight writer before allowing cache clearing', async () => {
    const releaseWriter = acquireCacheClearWriteLock();
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
    expect(() => acquireCacheClearWriteLock()).toThrow('Cache clearing is in progress');
    cacheClear!.release();
    const releaseWriter = acquireCacheClearWriteLock();
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
        delete (navigator as Navigator & { locks?: unknown }).locks;
      }
    }
  });
});
