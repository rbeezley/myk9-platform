/**
 * The signed-in identity, as a signal device-local state can subscribe to
 * (MYK9-651).
 *
 * `AuthProvider` announces it (through `useNotifyAccountBoundary`) once when
 * the session first settles and again whenever the identity changes. State
 * that must not outlive the account that produced it subscribes here instead of
 * being imported by the auth layer. The cart store is the first subscriber: it
 * is persisted, and before this nothing reset it on sign-out.
 *
 * A registry rather than a direct call so `AuthProvider` does not import every
 * store it has to clear, and so a test that replaces a store module does not
 * break every render that mounts `AuthProvider`.
 */
export interface AccountIdentityChange {
  /** The auth user id now signed in, or null when nobody is. */
  userId: string | null;
  /**
   * True for the first settled observation in this tab. It is not a CHANGE of
   * identity, so a subscriber decides from what it persisted whether its data
   * belongs to `userId`; later announcements are always a change.
   */
  initial: boolean;
}

type AccountIdentityListener = (change: AccountIdentityChange) => void;

const listeners = new Set<AccountIdentityListener>();

/** Run `listener` on every identity announcement. Returns an unsubscribe. */
export function onAccountIdentity(listener: AccountIdentityListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tell every subscriber who is signed in now. */
export function announceAccountIdentity(change: AccountIdentityChange): void {
  for (const listener of listeners) listener(change);
}
