import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  getActiveJudgeAssignmentsForShow,
  subscribeToJudgeAssignmentChanges,
} from '@/services/database/judges';
import { useReplicationSync } from '@/hooks/useReplicationSync';
import { areReplicationTablesPendingFirstSync } from '@/utils/replicationSyncEmptyState';
import { UserRole } from '@/types/auth-types';
import { deriveRingsideJudgePersonIdFromClaim } from '@/store/ringsideGrantStore';

export interface MyAtShowJudgeAssignmentsResult {
  assignedClassIds: Set<string>;
  /**
   * The assignment set could not be determined -- an empty `assignedClassIds`
   * means "unknown", not "none". True when the judge's person identity has not
   * resolved (offline cold boot: roles are cached, identity is not) or when the
   * lookup never completed. Callers MUST NOT render "no classes assigned" from
   * an empty set while this is true, and a judge-only picker must not list the
   * whole show either: it shows a "not on this device yet" page with a retry (MYK9-2014).
   */
  isUnknown: boolean;
  error: Error | null;
  isLoading: boolean;
  retry: () => void;
}

/**
 * Offline-only class assignments for the identifiable signed-in judge, or for
 * the judge a per-judge passcode session belongs to (MYK9-1951: the claim's
 * `ringside_person_id`). Admin and steward passcode sessions carry no person
 * identity, so they intentionally resolve to an empty set and stay unfiltered.
 */
export function useMyAtShowJudgeAssignments(
  showId: string | undefined
): MyAtShowJudgeAssignmentsResult {
  const queryClient = useQueryClient();
  const {
    hasRole,
    user,
    personId: accountPersonId,
    personIdentityState,
    personIdentityLookup,
  } = useAuthContext();
  const { status: syncStatus, syncTable } = useReplicationSync();
  const isJudgeAccount = !user?.is_anonymous && hasRole(UserRole.JUDGE);
  const passcodePersonId = deriveRingsideJudgePersonIdFromClaim(user, showId);
  const personId = isJudgeAccount
    ? (accountPersonId ?? undefined)
    : (passcodePersonId ?? undefined);
  // Roles survive a cold offline boot via the MYK9-200 permissions cache. The
  // person id comes from AuthContext's `personId`, which falls back to the
  // device-saved pairing (MYK9-2014) -- `databaseUserId` is the network-only
  // lookup and is undefined offline. Only a device that never confirmed the
  // pairing still holds hasRole(JUDGE) with no person id. Assignments are then
  // UNKNOWABLE, not empty -- rendering them as empty tells a judge standing at
  // their ring that their secretary never assigned them.
  // A first online sign-in has no saved pairing while the `people` lookup is in flight:
  // that is loading (the skeleton), not unknown.
  const identityLoading =
    isJudgeAccount &&
    !personId &&
    personIdentityState === 'unresolved' &&
    Boolean(personIdentityLookup?.fetching);
  const identityUnresolved = isJudgeAccount && !personId && !identityLoading;
  const isApplicable = Boolean(showId && personId);
  const lookupKey = isApplicable ? `${showId}:${personId}` : null;
  const refreshedEmptyCacheKey = useRef<string | null>(null);

  useEffect(() => {
    if (!showId || !personId) return;
    return subscribeToJudgeAssignmentChanges(() => {
      void queryClient.invalidateQueries({
        queryKey: ['at-show', 'judge-assignments', showId, personId],
      });
    });
  }, [personId, queryClient, showId]);

  // The queryFn deliberately resolves an EMPTY result while the app-wide first
  // sync is still in flight. Nothing in the query key changes when that sync
  // finishes, so without this the cached empty answer stands and an assigned
  // judge never sees "Your ring" until a reload. Re-run on the transition.
  const judgeTableStatus = syncStatus.tablesStatus.judge_assignments;
  const lastJudgeTableStatus = useRef(judgeTableStatus);
  useEffect(() => {
    const previous = lastJudgeTableStatus.current;
    lastJudgeTableStatus.current = judgeTableStatus;
    if (!isApplicable || previous === judgeTableStatus) return;
    // ANY status -> success, not just idle/syncing: a first sync that fails and
    // then recovers goes syncing -> error -> success, which would otherwise
    // reproduce the same stuck-empty result one retry later.
    if (judgeTableStatus !== 'success') return;
    void queryClient.invalidateQueries({
      queryKey: ['at-show', 'judge-assignments', showId, personId],
    });
  }, [isApplicable, judgeTableStatus, personId, queryClient, showId]);

  const query = useQuery({
    queryKey: ['at-show', 'judge-assignments', showId, personId],
    enabled: isApplicable,
    // Reads IndexedDB first; the default "online" mode pauses it offline and
    // the empty result would read as "no assignments". See RingsideShowBoundary.
    networkMode: 'always',
    // A device read that fails already waited out its own timeout; retrying it
    // three times with backoff kept the page on a skeleton for about a minute,
    // and every failure counts toward the IndexedDB circuit breaker. Fail once;
    // the page offers Try again (MYK9-769).
    retry: false,
    queryFn: async () => {
      const localAssignments = await getActiveJudgeAssignmentsForShow(
        showId as string,
        personId as string
      );
      if (localAssignments.length > 0 || !lookupKey) return localAssignments;

      const tableStatus = judgeTableStatus;
      if (tableStatus === 'idle' || tableStatus === 'syncing') {
        // The app-wide first sync is already the refresh for this lookup.
        refreshedEmptyCacheKey.current = lookupKey;
        return localAssignments;
      }

      const canRefresh = typeof navigator !== 'undefined' && navigator.onLine;
      if (
        !canRefresh ||
        tableStatus !== 'success' ||
        refreshedEmptyCacheKey.current === lookupKey
      ) {
        return localAssignments;
      }

      // A previously synced but empty cache may predate a just-added
      // assignment. Refresh once before treating it as authoritative.
      refreshedEmptyCacheKey.current = lookupKey;
      await syncTable('judge_assignments');
      return getActiveJudgeAssignmentsForShow(showId as string, personId as string);
    },
  });

  const assignments = query.data;
  const assignedClassIds = useMemo(
    () =>
      new Set(
        (assignments ?? [])
          .map(assignment => assignment.classId)
          .filter((classId): classId is string => Boolean(classId))
      ),
    [assignments]
  );
  const hasAssignments = (assignments?.length ?? 0) > 0;
  // The connectivity test that used to sit here now lives inside
  // `areReplicationTablesPendingFirstSync` (MYK9-365), so every call site gets
  // it instead of the two that remembered to write it out.
  const isWaitingForFirstSync =
    isApplicable &&
    !hasAssignments &&
    areReplicationTablesPendingFirstSync(syncStatus, ['judge_assignments']);
  const replicationError =
    isApplicable && !hasAssignments && syncStatus.tablesStatus.judge_assignments === 'error'
      ? new Error('Judge assignments could not be refreshed')
      : null;

  // An empty set is only trustworthy when a read actually completed AND the
  // table it read has synced at least once. The queryFn deliberately RESOLVES
  // an empty array while the first sync is still pending (see above), so
  // `data === undefined` alone misses the case where an offline judge's
  // assignments simply had not landed before connectivity dropped -- the cache
  // then holds a settled [] that is indistinguishable from "none assigned".
  const judgeTableNeverSynced =
    judgeTableStatus === 'idle' || judgeTableStatus === 'syncing' || judgeTableStatus === 'error';
  // A read that never completed is unknown, failed ones included (MYK9-769):
  // it fails open to the full picker with the "couldn't load your assigned
  // classes" banner instead of a page with no classes at the ring. A failed
  // REFETCH keeps the assignments it already read, so the ring stays narrowed.
  const assignmentsUnresolved =
    isApplicable &&
    !query.isLoading &&
    (query.data === undefined || (!hasAssignments && judgeTableNeverSynced));

  return {
    assignedClassIds,
    isUnknown: identityUnresolved || assignmentsUnresolved,
    error: query.error instanceof Error ? query.error : replicationError,
    isLoading: identityLoading || (isApplicable && (query.isLoading || isWaitingForFirstSync)),
    retry: () => {
      // Without a person id the assignments query is disabled; ask for the missing piece.
      if (isJudgeAccount && !personId) personIdentityLookup?.retry();
      void syncTable('judge_assignments').then(() => query.refetch());
    },
  };
}
