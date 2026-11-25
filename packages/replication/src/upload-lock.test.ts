import { afterEach, describe, expect, it, vi } from 'vitest';
import { UploadLock } from './upload-lock';

describe('UploadLock.runWithin (MYK9-2360)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('surfaces the callback error when it runs past the timeout and then throws', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const lock = new UploadLock();
    let fail!: (error: Error) => void;
    const result = lock.runWithin(
      () =>
        new Promise<never>((_, reject) => {
          fail = reject;
        }),
      1_000
    );
    const outcome = expect(result).rejects.toThrow('restore broke');

    await vi.advanceTimersByTimeAsync(5_000);
    fail(new Error('restore broke'));
    await outcome;
  });

  it('reports a timeout, without running the callback, when the lock is never granted', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const lock = new UploadLock();
    void lock.run(() => new Promise<void>(() => undefined));
    const callback = vi.fn(async () => 'ran');

    const result = lock.runWithin(callback, 1_000);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(result).resolves.toEqual({ timedOut: true });
    expect(callback).not.toHaveBeenCalled();
  });
});
