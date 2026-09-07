/**
 * Empties the React Query cache whenever the SIGNED-IN IDENTITY changes.
 *
 * `queryClient` is a module singleton nothing recreated on an auth change, so
 * before this every cached row outlived the account that fetched it: the next
 * account signing in on the same tab was served them without a request, and
 * therefore without RLS (MYK9-429). Per-key `viewerScope()` segments cover the
 * keys we know about; this covers the ones nobody has written yet.
 *
 * Three properties matter, and each is a way to get this wrong:
 *
 * 1. It fires on an identity CHANGE, never on a token refresh. Supabase hands
 *    back a fresh `User` object on every refresh, so the comparison is on
 *    `user.id` — the same id refreshed a hundred times clears nothing.
 * 2. The first ready observation is a BASELINE, not a change. A cold boot
 *    (offline included) restores a session and lands on some id for the first
 *    time; treating that as a transition would discard the cache on every page
 *    load, which is precisely the offline-first behaviour that must not change.
 * 3. It waits for `authReady`. Before the session restore settles, `userId` is
 *    null for everyone — taking that as the baseline would make the subsequent
 *    null -> id restore look like a switch of accounts.
 *
 * Offline domain data does not live here: replicated show/class/entry data is
 * in IndexedDB behind `@myk9/replication`, and cached RBAC permissions are in
 * their own device-local store, so neither is touched by clearing this cache.
 *
 * Mirrors `useClassHideCacheBoundary` and `useResetSavedViewsOnAccountChange`,
 * which draw the same boundary for the replicated class cache and for
 * device-local saved views.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export interface ClearQueryCacheOnAccountChangeOptions {
  /** Auth has finished its initial session restore. */
  authReady: boolean;
  /** The authenticated auth user id, or null when signed out. */
  userId: string | null;
}

export function useClearQueryCacheOnAccountChange({
  authReady,
  userId,
}: ClearQueryCacheOnAccountChangeOptions): void {
  const queryClient = useQueryClient();
  // `undefined` means "no baseline yet" and is deliberately distinct from the
  // `null` of a signed-out viewer, which IS an identity worth comparing.
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!authReady) return;

    const priorUserId = previousUserId.current;
    if (priorUserId !== undefined && priorUserId !== userId) {
      queryClient.clear();
    }

    previousUserId.current = userId;
  }, [authReady, queryClient, userId]);
}

export default useClearQueryCacheOnAccountChange;
