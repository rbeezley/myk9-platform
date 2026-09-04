const CACHE_CLEAR_LOCK_KEY = 'myk9-cache-clear-lock';
const CACHE_CLEAR_LOCK_TTL_MS = 60_000;

let cacheClearInProgress = false;
let activeWriters = 0;
let writersDrained: Promise<void> | null = null;
let resolveWritersDrained: (() => void) | null = null;

function readForeignLock(): boolean {
  if (typeof localStorage === 'undefined') return false;

  try {
    const raw = localStorage.getItem(CACHE_CLEAR_LOCK_KEY);
    if (!raw) return false;
    const lock = JSON.parse(raw) as { expiresAt?: unknown };
    if (typeof lock.expiresAt !== 'number' || lock.expiresAt <= Date.now()) {
      localStorage.removeItem(CACHE_CLEAR_LOCK_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Acquire a synchronous write slot for work that cache clearing must not interrupt. */
export function acquireCacheClearWriteLock(): () => void {
  if (cacheClearInProgress || readForeignLock()) {
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

/**
 * Block new local writes and wait for writes already in flight to finish.
 * Returns null when another tab is already clearing its cache.
 */
export function beginCacheClear(): {
  waitForWriters: () => Promise<void>;
  release: () => void;
} | null {
  if (cacheClearInProgress || readForeignLock()) return null;

  cacheClearInProgress = true;
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    localStorage.setItem(
      CACHE_CLEAR_LOCK_KEY,
      JSON.stringify({ token, expiresAt: Date.now() + CACHE_CLEAR_LOCK_TTL_MS })
    );
  } catch {
    // The in-memory gate still protects this tab when storage is unavailable.
  }

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
      try {
        const raw = localStorage.getItem(CACHE_CLEAR_LOCK_KEY);
        const lock = raw ? (JSON.parse(raw) as { token?: unknown }) : null;
        if (lock?.token === token) localStorage.removeItem(CACHE_CLEAR_LOCK_KEY);
      } catch {
        // Best-effort cleanup; the TTL prevents a stale cross-tab lock.
      }
    },
  };
}
