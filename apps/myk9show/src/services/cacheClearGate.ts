const CACHE_CLEAR_LOCK_NAME = 'myk9-cache-clear-lock';

type LockManagerLike = {
  request: <T>(
    name: string,
    options: { mode: 'exclusive' | 'shared'; ifAvailable?: boolean },
    callback: (lock: object | null) => Promise<T> | T
  ) => Promise<T>;
};

let cacheClearInProgress = false;
let activeWriters = 0;
let writersDrained: Promise<void> | null = null;
let resolveWritersDrained: (() => void) | null = null;

function getLockManager(): LockManagerLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { locks?: LockManagerLike }).locks;
}

function acquireLocalWriteLock(): () => void {
  if (cacheClearInProgress) {
    throw new Error('Cache clearing is in progress');
  }

  activeWriters += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeWriters -= 1;
    if (activeWriters === 0 && resolveWritersDrained) {
      resolveWritersDrained();
      writersDrained = null;
      resolveWritersDrained = null;
    }
  };
}

/** Acquire a synchronous local write slot for legacy callers and tests. */
export function acquireCacheClearWriteLockSync(): () => void {
  return acquireLocalWriteLock();
}

/** Acquire a shared browser lock for the full local write/queue operation. */
export async function acquireCacheClearWriteLock(): Promise<() => void> {
  const locks = getLockManager();
  if (!locks) return acquireLocalWriteLock();

  let resolveAcquired: ((release: () => void) => void) | undefined;
  let rejectAcquired: ((error: unknown) => void) | undefined;
  const acquired = new Promise<() => void>((resolve, reject) => {
    resolveAcquired = resolve;
    rejectAcquired = reject;
  });
  let resolveReleased: (() => void) | undefined;
  const released = new Promise<void>(resolve => {
    resolveReleased = resolve;
  });

  void locks
    .request(CACHE_CLEAR_LOCK_NAME, { mode: 'shared' }, async lock => {
      if (!lock) {
        rejectAcquired?.(new Error('Unable to acquire cache write lock'));
        return;
      }
      try {
        const releaseLocal = acquireLocalWriteLock();
        let releasedByCaller = false;
        resolveAcquired?.(() => {
          if (releasedByCaller) return;
          releasedByCaller = true;
          releaseLocal();
          resolveReleased?.();
        });
        await released;
      } catch (error) {
        rejectAcquired?.(error);
      }
    })
    .catch(error => rejectAcquired?.(error));

  return acquired;
}

/** Run a local write while holding the shared cross-tab writer lock. */
export function withCacheClearWriteLock<T>(action: () => Promise<T> | T): Promise<T> {
  if (!getLockManager()) {
    const release = acquireLocalWriteLock();
    try {
      return Promise.resolve(action()).finally(release);
    } catch (error) {
      release();
      return Promise.reject(error);
    }
  }

  return acquireCacheClearWriteLock().then(release => Promise.resolve(action()).finally(release));
}

function beginLocalCacheClear(): {
  waitForWriters: () => Promise<void>;
  release: () => void;
} | null {
  if (cacheClearInProgress) return null;

  cacheClearInProgress = true;
  return {
    waitForWriters: () => {
      if (activeWriters === 0) return Promise.resolve();
      if (!writersDrained) {
        writersDrained = new Promise<void>(resolve => {
          resolveWritersDrained = resolve;
        });
      }
      return writersDrained;
    },
    release: () => {
      cacheClearInProgress = false;
    },
  };
}

/**
 * Run a cache clear while holding a browser-level exclusive lock. Web Locks
 * makes the cross-tab acquisition atomic; the in-memory fallback covers test
 * environments and browsers without the API.
 */
export async function withCacheClearLock<T>(action: () => Promise<T> | T): Promise<T | null> {
  const locks = getLockManager();
  if (locks) {
    return locks.request(
      CACHE_CLEAR_LOCK_NAME,
      { mode: 'exclusive', ifAvailable: true },
      async lock => {
        if (!lock) return null;
        const gate = beginLocalCacheClear();
        if (!gate) return null;
        try {
          await gate.waitForWriters();
          return await action();
        } finally {
          gate.release();
        }
      }
    );
  }

  const gate = beginLocalCacheClear();
  if (!gate) return null;
  try {
    if (activeWriters === 0) return await action();
    await gate.waitForWriters();
    return await action();
  } finally {
    gate.release();
  }
}

/** Legacy synchronous entry point for short local-only coordination. */
export function beginCacheClear(): {
  waitForWriters: () => Promise<void>;
  release: () => void;
} | null {
  return beginLocalCacheClear();
}
