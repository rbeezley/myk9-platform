import { beforeEach, describe, expect, it } from 'vitest';
import { acquireCacheClearWriteLock, beginCacheClear } from './cacheClearGate';

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
});
