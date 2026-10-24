import { createJSONStorage, type PersistStorage, type StorageValue } from 'zustand/middleware';
import { getOptimalStorage } from '@/services/database/storage-adapter';
import { logger } from '@/services/LoggingService';

/** Trailing window for coalescing wizard draft writes (typing in a text field). */
export const WIZARD_PERSIST_DEBOUNCE_MS = 300;

export interface DebouncedPersistStorage<S> extends PersistStorage<S> {
  /** Writes every pending value now. Resolves once the underlying writes settle. */
  flush: () => Promise<void>;
}

/**
 * Wraps a zustand `PersistStorage` so a burst of `setItem` calls becomes one
 * trailing write of the last value. The wizard store `set`s on every keystroke
 * and persist would otherwise serialise the whole draft and write it to
 * IndexedDB each time; wrapping at this level also defers the serialisation.
 *
 * - `getItem` returns a pending (unwritten) value first, so a rehydrate never
 *   reads a stale draft.
 * - `removeItem` drops the pending value so it cannot resurrect a cleared draft.
 * - Pending values are flushed on `pagehide`, `beforeunload` and when the tab is
 *   hidden, so closing the tab right after typing keeps the draft (best effort:
 *   an IndexedDB write that is still in flight when the page dies can be lost,
 *   the same as before).
 */
export function createDebouncedPersistStorage<S>(
  inner: PersistStorage<S>,
  delayMs: number = WIZARD_PERSIST_DEBOUNCE_MS
): DebouncedPersistStorage<S> {
  const pending = new Map<string, StorageValue<S>>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const clearTimer = (name: string) => {
    const timer = timers.get(name);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(name);
    }
  };

  const flushOne = async (name: string): Promise<void> => {
    clearTimer(name);
    const value = pending.get(name);
    if (value === undefined) return;
    pending.delete(name);
    try {
      await inner.setItem(name, value);
    } catch (error) {
      logger.warn('Debounced wizard draft write failed', 'storage', { name, error });
    }
  };

  const flush = async (): Promise<void> => {
    await Promise.all([...pending.keys()].map(flushOne));
  };

  if (typeof window !== 'undefined') {
    const flushQuietly = () => {
      void flush();
    };
    window.addEventListener('pagehide', flushQuietly);
    window.addEventListener('beforeunload', flushQuietly);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushQuietly();
    });
  }

  return {
    getItem: name => {
      const value = pending.get(name);
      return value !== undefined ? value : inner.getItem(name);
    },
    setItem: (name, value) => {
      pending.set(name, value);
      clearTimer(name);
      timers.set(
        name,
        setTimeout(() => {
          void flushOne(name);
        }, delayMs)
      );
    },
    removeItem: name => {
      clearTimer(name);
      pending.delete(name);
      return inner.removeItem(name);
    },
    flush,
  };
}

/** The wizard store's persist storage: optimal backend (IndexedDB/localStorage), debounced writes. */
export function createWizardPersistStorage<S>(): DebouncedPersistStorage<S> | undefined {
  const base = createJSONStorage<S>(() => getOptimalStorage('wizard'));
  return base ? createDebouncedPersistStorage(base) : undefined;
}
