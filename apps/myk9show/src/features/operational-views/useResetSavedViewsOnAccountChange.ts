/**
 * Account-change reset for personal saved views (tasks.md 3.3, design.md
 * Decision 2 risk: "Local saved views appear shared or leak scope on a
 * shared tablet"). When the authenticated user id changes — including
 * sign-out (id -> undefined) — clear every local saved view belonging to the
 * PRIOR user so a later sign-in on the same device never lists or restores
 * someone else's saved view.
 *
 * CONCERNS (see final report): `useAuthContext` does not expose a dedicated
 * "user changed" or "signed out" event; this hook infers the transition from
 * `user?.id` changing between renders, which is the closest available signal.
 */
import { useEffect, useRef } from 'react';
import { clearAllLocalViewsForUser } from '@/features/operational-views/localViewPreferences';

export function useResetSavedViewsOnAccountChange(currentUserId: string | null | undefined): void {
  const prevUserIdRef = useRef<string | null | undefined>(currentUserId);

  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    if (prevUserId && prevUserId !== currentUserId) {
      const storage = typeof window !== 'undefined' ? window.localStorage : undefined;
      clearAllLocalViewsForUser(storage, prevUserId);
    }
    prevUserIdRef.current = currentUserId;
  }, [currentUserId]);
}

export default useResetSavedViewsOnAccountChange;
