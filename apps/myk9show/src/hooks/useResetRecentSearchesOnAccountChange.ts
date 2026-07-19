/**
 * Account-change reset for device-local recent searches
 * (context-aware-command-menu, design.md Decision 4: "Recent searches
 * remain device-local, validated, and safe to clear ... account changes
 * clear in-memory history"). When the authenticated user id changes —
 * including sign-out (id -> undefined) — clear every persisted recent
 * search belonging to the PRIOR user. `useRecentSearches` itself reads the
 * authenticated userId and re-runs its restore effect whenever it changes,
 * so any mounted instance's in-memory state is cleared/reloaded for the new
 * user on the same render pass this hook clears storage — no separate
 * event channel is needed.
 *
 * Mirrors `useResetSavedViewsOnAccountChange` (operational-views feature)
 * exactly: `useAuthContext` exposes no dedicated "user changed"/"signed out"
 * event, so the transition is inferred from `user?.id` changing between
 * renders — the closest available signal.
 */
import { useEffect, useRef } from 'react';
import { clearAllRecentSearchesForUser } from '@/hooks/useRecentSearches';

export function useResetRecentSearchesOnAccountChange(currentUserId: string | null | undefined): void {
  const prevUserIdRef = useRef<string | null | undefined>(currentUserId);

  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    if (prevUserId && prevUserId !== currentUserId) {
      const storage = typeof window !== 'undefined' ? window.localStorage : undefined;
      clearAllRecentSearchesForUser(storage, prevUserId);
    }
    prevUserIdRef.current = currentUserId;
  }, [currentUserId]);
}

export default useResetRecentSearchesOnAccountChange;
