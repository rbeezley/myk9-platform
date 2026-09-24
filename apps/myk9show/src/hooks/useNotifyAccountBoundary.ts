/**
 * Raises the account boundary (`@/lib/accountBoundary`) whenever the SIGNED-IN
 * IDENTITY changes (MYK9-651). Its first subscriber is the cart store, which is
 * `persist`ed and whose `reset()` had no production caller, so a signed-out tab
 * kept the departed user's cart in memory and on disk and handed it to the next
 * account on the device.
 *
 * Same boundary as `useClearQueryCacheOnAccountChange`:
 *
 * 1. It fires on an identity CHANGE, compared by `user.id`, never on a token
 *    refresh (which hands back a fresh `User` for the same id).
 * 2. The first ready observation of a signed-IN user is a baseline, not a
 *    change, so a page load (offline included) keeps the draft it restored.
 * 3. It waits for `authReady`, since `userId` is null for everyone before the
 *    session restore settles.
 *
 * One difference: a first ready observation of a signed-OUT viewer fires too.
 * Nobody is signed in, so anything device-local still keyed to an account
 * belongs to a session that ended without passing through here (a tab closed
 * while signed in, then the session expired), and there is no one it could
 * belong to.
 */
import { useEffect, useRef } from 'react';
import { notifyAccountBoundary } from '@/lib/accountBoundary';

export interface NotifyAccountBoundaryOptions {
  /** Auth has finished its initial session restore. */
  authReady: boolean;
  /** The authenticated auth user id, or null when signed out. */
  userId: string | null;
}

export function useNotifyAccountBoundary({
  authReady,
  userId,
}: NotifyAccountBoundaryOptions): void {
  // `undefined` means "no baseline yet", distinct from a signed-out `null`.
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!authReady) return;

    const priorUserId = previousUserId.current;
    const isBaseline = priorUserId === undefined;
    if ((isBaseline && userId === null) || (!isBaseline && priorUserId !== userId)) {
      notifyAccountBoundary();
    }

    previousUserId.current = userId;
  }, [authReady, userId]);
}

export default useNotifyAccountBoundary;
