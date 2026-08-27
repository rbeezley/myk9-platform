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

export interface MyAtShowJudgeAssignmentsResult {
  assignedClassIds: Set<string>;
  /**
   * The assignment set could not be determined -- an empty `assignedClassIds`
   * means "unknown", not "none". True when the judge's person identity has not
   * resolved (offline cold boot: roles are cached, identity is not) or when the
   * lookup never completed. Callers MUST NOT render "no classes assigned" from
   * an empty set while this is true; fail open to the unfiltered picker instead.
   */
  isUnknown: boolean;
  error: Error | null;
  isLoading: boolean;
  retry: () => void;
}

/**
 * Offline-only class assignments for the identifiable signed-in judge.
 *
 * Anonymous passcode sessions carry a show-wide role claim but no canonical
 * person identity, so they intentionally resolve to an empty set.
 */
export function useMyAtShowJudgeAssignments(
  showId: string | undefined
): MyAtShowJudgeAssignmentsResult {
  const queryClient = useQueryClient();
  const { hasRole, user, userWithRoles } = useAuthContext();
  const { status: syncStatus, syncTable } = useReplicationSync();
  const isJudgeAccount = !user?.is_anonymous && hasRole(UserRole.JUDGE);
  const personId = isJudgeAccount ? userWithRoles?.databaseUserId : undefined;
  // Roles survive a cold offline boot via the MYK9-200 permissions cache, but
  // `databaseUserId` still comes from the `people` lookup in AuthContext, which
  // is a plain network query. So offline a judge holds hasRole(JUDGE) === true
  // and databaseUserId === undefined at the same time. Assignments are then
  // UNKNOWABLE, not empty -- rendering them as empty tells a judge standing at
  // their ring that their secretary never assigned them.
  const identityUnresolved = isJudgeAccount && !personId;
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
  const isWaitingForFirstSync =
    isApplicable &&
    !hasAssignments &&
    typeof navigator !== 'undefined' &&
    navigator.onLine &&
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
  const assignmentsUnresolved =
    isApplicable &&
    !query.isLoading &&
    !query.error &&
    (query.data === undefined || (!hasAssignments && judgeTableNeverSynced));

  return {
    assignedClassIds,
    isUnknown: identityUnresolved || assignmentsUnresolved,
    error: query.error instanceof Error ? query.error : replicationError,
    isLoading: isApplicable && (query.isLoading || isWaitingForFirstSync),
    retry: () => {
      void syncTable('judge_assignments').then(() => query.refetch());
    },
  };
}
