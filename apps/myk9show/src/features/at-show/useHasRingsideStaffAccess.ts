/**
 * Is this viewer admitted to ringside for THIS show by staff standing alone (no entry needed)?
 *
 * Three show-scoped clauses: a show-scoped passcode grant (`AtShowAccessGate`'s first clause); an
 * account staff role scoped to this show or its club (`hasRingsideAccountShowAccess`); or a judge
 * with an active assignment at this show, class-level or show-level (the same
 * affiliation source `useMyJudgedShows` reads). A staff role held for another show or club does not count, so
 * browsing an unrelated show keeps the public landing. The show page uses it so a judge, steward or
 * passcode user reaches the Results tab during the show (MYK9-1544).
 *
 * A judge whose assignments cannot be known yet (offline cold boot: roles cached, identity not) is
 * admitted rather than shown the wrong surface; the Results tab's release gate still applies.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMyJudgedShows } from '@/features/messages/hooks/useMyJudgedShows';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useReplicationSync } from '@/hooks/useReplicationSync';
import { UserRole } from '@/types/auth-types';
import { hasRingsideAccountShowAccess } from './ringsideAccountAccess';
import { useRehydrateRingsideGrant } from './useRehydrateRingsideGrant';

export function useHasRingsideStaffAccess(
  showId: string | undefined,
  clubId: string | undefined
): boolean {
  const queryClient = useQueryClient();
  const { hasRole, userWithRoles } = useAuthContext();
  const { status: syncStatus, syncTable } = useReplicationSync();
  const grantRole = useRehydrateRingsideGrant(showId);
  const judged = useMyJudgedShows(true);
  const personId = userWithRoles?.databaseUserId;
  const knownWithoutShow =
    judged.status === 'known' && !judged.shows.some(show => show.showId === showId);
  const canRefresh =
    knownWithoutShow &&
    Boolean(showId && personId) &&
    syncStatus.tablesStatus.judge_assignments === 'success' &&
    typeof navigator !== 'undefined' &&
    navigator.onLine;
  const refreshedKey = useRef<string | null>(null);

  // A cached list that omits this show may predate a just-added assignment (the
  // refresh the show-specific lookup used to do). Re-sync once per show and person
  // before treating the judge as unrelated to it.
  useEffect(() => {
    const key = `${showId}:${personId}`;
    if (!canRefresh || refreshedKey.current === key) return;
    refreshedKey.current = key;
    void syncTable('judge_assignments').then(() =>
      queryClient.invalidateQueries({ queryKey: ['messages', 'judged-shows', personId] })
    );
  }, [canRefresh, personId, queryClient, showId, syncTable]);

  if (grantRole) return true;
  if (
    showId &&
    clubId &&
    hasRingsideAccountShowAccess(userWithRoles, hasRole, { id: showId, clubId })
  )
    return true;
  if (!hasRole(UserRole.JUDGE)) return false;
  if (judged.status === 'not-judge') return false;
  if (judged.status !== 'known') return true;
  return !knownWithoutShow;
}
