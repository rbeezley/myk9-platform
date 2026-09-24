/**
 * Announces the signed-in identity (`@/lib/accountBoundary`) when the session
 * first settles and whenever it CHANGES (MYK9-651). Its first subscriber is the
 * cart store, which is `persist`ed and whose `reset()` had no production
 * caller, so a signed-out tab kept the departed user's cart in memory and on
 * disk and handed it to the next account on the device.
 *
 * Same boundary as `useClearQueryCacheOnAccountChange`:
 *
 * 1. A change is compared by `user.id`, never by object, so a token refresh
 *    (a fresh `User` for the same id) announces nothing.
 * 2. It waits for `authReady`, since `userId` is null for everyone before the
 *    session restore settles.
 * 3. The first settled observation is announced as `initial`, not as a change.
 *    A page load (offline included) must keep a draft that belongs to the
 *    restored account, so the subscriber compares the identity it persisted
 *    with this one rather than resetting blindly; that is also what catches
 *    account A's data on a tab that opens with account B already signed in.
 */
import { useEffect, useRef } from 'react';
import { announceAccountIdentity } from '@/lib/accountBoundary';

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
  // `undefined` means "nothing announced yet", distinct from a signed-out `null`.
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!authReady) return;

    const priorUserId = previousUserId.current;
    if (priorUserId === undefined) {
      announceAccountIdentity({ userId, initial: true });
    } else if (priorUserId !== userId) {
      announceAccountIdentity({ userId, initial: false });
    }

    previousUserId.current = userId;
  }, [authReady, userId]);
}

export default useNotifyAccountBoundary;
