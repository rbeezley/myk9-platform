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

/** Acquire a synchronous write slot for a local write/queue pair. */
export function acquireCacheClearWriteLock(): () => void {
  return acquireLocalWriteLock();
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
