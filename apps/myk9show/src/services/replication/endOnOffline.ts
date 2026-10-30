/**
 * Bounds a wait on the network by connectivity (MYK9-1509).
 *
 * A fetch or sync can wait on a dead connection instead of rejecting, which
 * leaves its owner (and every consumer of it) pending forever. Offline is the
 * one connection state the browser reports reliably, so it ends the wait:
 * resolves with `promise`'s result, or with `offlineValue` at once when the
 * device is already offline or the moment `offline` fires. The listener is
 * removed whichever side settles first. The abandoned promise is ignored.
 */
export function endOnOffline<T, O = T>(promise: Promise<T>, offlineValue: O): Promise<T | O> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    // Nobody will read the abandoned promise; keep a late rejection quiet.
    promise.catch(() => {});
    return Promise.resolve(offlineValue);
  }
  if (typeof window === 'undefined') return promise;
  return new Promise<T | O>((resolve, reject) => {
    const onOffline = () => {
      window.removeEventListener('offline', onOffline);
      promise.catch(() => {});
      resolve(offlineValue);
    };
    window.addEventListener('offline', onOffline);
    promise.then(
      value => {
        window.removeEventListener('offline', onOffline);
        resolve(value);
      },
      error => {
        window.removeEventListener('offline', onOffline);
        reject(error);
      }
    );
  });
}
