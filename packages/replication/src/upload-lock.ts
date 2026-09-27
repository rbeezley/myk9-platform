/** Web Locks name that serializes queue uploads across tabs (audit M1). */
export const UPLOAD_LOCK_NAME = 'replication-upload';

type LockManagerLike = {
  request: <R>(name: string, callback: () => Promise<R>) => Promise<R>;
};

function webLocks(): LockManagerLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const locks = (navigator as unknown as { locks?: Partial<LockManagerLike> }).locks;
  return locks && typeof locks.request === 'function' ? (locks as LockManagerLike) : undefined;
}

/**
 * The one exclusive section around queue uploads. Held by every upload pass and
 * by the MYK9-771 single-row re-fetch, so a re-fetch never overlaps an upload
 * (or the OCC rejection an upload handles).
 *
 * With Web Locks this IS the `replication-upload` lock, shared by all tabs.
 * Without them (older engines, tests) it falls back to an in-tab FIFO mutex.
 * A free mutex runs its callback synchronously, so an upload that finds it free
 * still sets `isUploading` before returning, as it did before this mutex.
 *
 * Never call `run` from inside a callback already running under it: the
 * callback would wait for itself. Code inside an upload QUEUES work instead.
 */
export class UploadLock {
  private held = false;
  private readonly waiters: Array<() => void> = [];

  /** True when the lock is the cross-tab Web Locks one. */
  isCrossTab(): boolean {
    return webLocks() !== undefined;
  }

  run<R>(callback: () => Promise<R>): Promise<R> {
    const locks = webLocks();
    if (locks) return locks.request(UPLOAD_LOCK_NAME, callback);
    if (!this.held) return this.runHeld(callback);
    return new Promise<R>((resolve, reject) => {
      this.waiters.push(() => {
        this.runHeld(callback).then(resolve, reject);
      });
    });
  }

  private runHeld<R>(callback: () => Promise<R>): Promise<R> {
    this.held = true;
    let result: Promise<R>;
    try {
      result = callback();
    } catch (error) {
      result = Promise.reject(error);
    }
    return result.finally(() => {
      const next = this.waiters.shift();
      if (next) next();
      else this.held = false;
    });
  }
}
