import { useMemo } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useShowStore } from '@/store/showStore';
import { useShowQuery } from '@/hooks/queries/useShowsDatabase';
import { canManageShowSurface } from '@/utils/roleScopes';
import { UserRole } from '@/types/auth-types';

/**
 * Where the "may this viewer manage this show?" question currently stands.
 *
 * - `resolved`     — the answer is final; read `canManage`.
 * - `resolving`    — the owning club is not known YET (cold store, show read in
 *                    flight). `canManage` is false, but a caller must HOLD rather
 *                    than render the denied surface, or a legitimate secretary
 *                    sees the exhibitor view flash before the staff one.
 * - `unavailable`  — the show read settled without a show (not found, soft-deleted,
 *                    offline with a cold replication store). The answer is a
 *                    permanent false for this render; callers surface a degraded
 *                    state instead of silently demoting the viewer.
 */
export type ShowManageScopeStatus = 'resolved' | 'resolving' | 'unavailable';

export interface ShowManageScope {
  status: ShowManageScopeStatus;
  /** True ONLY when the viewer is confirmed to manage this show. Fail-closed otherwise. */
  canManage: boolean;
  /** The owning club, once known. */
  clubId: string | undefined;
}

/**
 * THE canonical show-ownership gate for every surface that scopes management
 * rights to the show's owning club (MYK9-464).
 *
 * Callers used to each re-derive this: read the show from the store, fall back
 * to a query, then hand-roll booleans for the loading and not-found windows.
 * Every such caller drifted from the others, and each fix for one window opened
 * another (see the PR #2180 review history). This hook owns all three states so
 * there is exactly one place where the transitions are defined and tested.
 *
 * Two short-circuits keep the common cases free of any resolution window at all:
 *
 * 1. A site admin manages every show, so their answer never depends on the club
 *    id — they are never held, and never demoted when the show read fails.
 * 2. A viewer holding NO club-staff role can never manage any show, so they pay
 *    for no show read and are never held either. This is the public/exhibitor
 *    path, i.e. most traffic.
 *
 * @param showId The show to scope against. Pass `undefined` when it is not yet
 *   known (e.g. a class page whose parent trial has not resolved); that reads as
 *   `resolving` for a viewer who could otherwise manage it.
 */
export function useShowManageScope(showId: string | undefined): ShowManageScope {
  const { hasRole, userWithRoles } = useAuthContext();
  // Derived from `hasRole`, not read off the context, so this hook has ONE
  // source of role truth. AuthContext defines both as exactly these calls
  // (context/AuthContext.tsx:322-323); taking both inputs let them drift.
  const isAdmin = hasRole(UserRole.SITE_ADMIN);
  const isSecretary = hasRole(UserRole.SECRETARY);
  const { shows } = useShowStore();

  // Offline-durable source first: the replicated show store. A management deep
  // link must resolve ownership with no network (CLAUDE.md § offline-first).
  const storedShow = useMemo(
    () => (showId ? shows.find(show => show.id === showId) : undefined),
    [shows, showId]
  );

  const couldManageSomeShow = isAdmin || isSecretary || hasRole(UserRole.CLUB_ADMIN);
  // Only viewers who could possibly manage a show need the ownership read.
  // `useShowQuery` no-ops on an empty id, which keeps this hook unconditional.
  const needsShowRead = couldManageSomeShow && !isAdmin && !!showId && !storedShow;
  const {
    data: queriedShow,
    isLoading: queriedShowLoading,
    isPlaceholderData,
  } = useShowQuery(needsShowRead ? showId : '');

  return useMemo(() => {
    // (1) Site admin: global, so ownership never enters into it.
    if (isAdmin) {
      return { status: 'resolved', canManage: true, clubId: storedShow?.clubId };
    }

    // (2) No club-staff role anywhere: a permanent, immediate no.
    if (!couldManageSomeShow) {
      return { status: 'resolved', canManage: false, clubId: storedShow?.clubId };
    }

    // `placeholderData: previousData` is set app-wide (lib/queryClient.ts), so a
    // show-id change inside a live component hands back the PREVIOUS show. Treat
    // that as "not yet resolved" — scoping against the wrong club is worse than
    // holding for a frame.
    const resolvedShow = storedShow ?? (isPlaceholderData ? undefined : queriedShow);
    const clubId = resolvedShow?.clubId || undefined;

    if (clubId) {
      return {
        status: 'resolved',
        canManage: canManageShowSurface({
          isSecretary,
          isAdmin,
          hasRole,
          userWithRoles,
          clubId,
        }),
        clubId,
      };
    }

    if (!showId || queriedShowLoading || isPlaceholderData) {
      return { status: 'resolving', canManage: false, clubId: undefined };
    }

    return { status: 'unavailable', canManage: false, clubId: undefined };
  }, [
    isAdmin,
    isSecretary,
    hasRole,
    userWithRoles,
    couldManageSomeShow,
    storedShow,
    queriedShow,
    queriedShowLoading,
    isPlaceholderData,
    showId,
  ]);
}
