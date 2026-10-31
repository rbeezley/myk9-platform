import { abortReason } from './mutation-utils';

/** Carries "AbortError" so the app's isAbortSyncError treats it as a cancellation. */
export const ABORTED_SYNC_MESSAGE = 'AbortError: the sync was cancelled';

interface AbortableBuilder<T> extends PromiseLike<T> {
  abortSignal(signal: AbortSignal): PromiseLike<T>;
}

function isAbortableBuilder<T>(work: PromiseLike<T>): work is AbortableBuilder<T> {
  return (
    typeof work === 'object' &&
    work !== null &&
    'abortSignal' in work &&
    typeof (work as { abortSignal?: unknown }).abortSignal === 'function'
  );
}

/**
 * Ends a wait on the network when `signal` aborts (MYK9-1624).
 *
 * A fetch can wait on a dead connection instead of rejecting. With a signal, a
 * Supabase builder gets `.abortSignal(...)` so the transport itself is released,
 * and the returned promise rejects with the abort reason at once either way.
 * The caller must treat the rejection as "nothing was learned": any result the
 * abandoned work produces later is never read. Without a signal, `work` is
 * returned untouched.
 */
export function abortableWait<T>(work: PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return Promise.resolve(work);
  if (signal.aborted) {
    // Never start the request.
    return Promise.reject(abortReason(signal));
  }
  const controller = new AbortController();
  const started = Promise.resolve(
    isAbortableBuilder(work) ? work.abortSignal(controller.signal) : work
  );
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      const reason = abortReason(signal);
      controller.abort(reason);
      reject(reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    started.then(
      value => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      error => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}
