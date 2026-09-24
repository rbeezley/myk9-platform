/**
 * The moment the signed-in identity changes, as a signal device-local state can
 * subscribe to (MYK9-651).
 *
 * `AuthProvider` raises it (through `useNotifyAccountBoundary`); state that must
 * not outlive the account that produced it registers here instead of being
 * imported by the auth layer. The cart store is the first subscriber: it is
 * persisted, and before this nothing reset it on sign-out.
 *
 * A registry rather than a direct call so `AuthProvider` does not import every
 * store it has to clear, and so a test that replaces a store module does not
 * break every render that mounts `AuthProvider`.
 */
type AccountBoundaryListener = () => void;

const listeners = new Set<AccountBoundaryListener>();

/** Run `listener` whenever the signed-in identity changes. Returns an unsubscribe. */
export function onAccountBoundary(listener: AccountBoundaryListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tell every subscriber the signed-in identity changed (or none is signed in). */
export function notifyAccountBoundary(): void {
  for (const listener of listeners) listener();
}
