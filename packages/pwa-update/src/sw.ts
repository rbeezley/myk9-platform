/// <reference lib="webworker" />

/**
 * Install the SKIP_WAITING message handler in a service worker.
 *
 * Pair with `setupPwaUpdate({ ... })` in the main thread — when the user
 * clicks "Update", the main thread posts { type: 'SKIP_WAITING' } and the
 * SW activates immediately instead of waiting for all clients to close.
 *
 * Call from inside your sw-custom file:
 *   declare const self: ServiceWorkerGlobalScope;
 *   installSkipWaitingHandler(self);
 */
export const installSkipWaitingHandler = (worker: ServiceWorkerGlobalScope): void => {
  worker.addEventListener('message', event => {
    if ((event.data as { type?: string } | undefined)?.type === 'SKIP_WAITING') {
      worker.skipWaiting();
    }
  });
};
