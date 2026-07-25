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
  const personId =
    !user?.is_anonymous && hasRole(UserRole.JUDGE) ? userWithRoles?.databaseUserId : undefined;
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
    if (judgeTableStatus !== 'success') return;
    if (previous !== 'idle' && previous !== 'syncing') return;
    void queryClient.invalidateQueries({
      queryKey: ['at-show', 'judge-assignments', showId, personId],
    });
  }, [isApplicable, judgeTableStatus, personId, queryClient, showId]);

  const query = useQuery({
    queryKey: ['at-show', 'judge-assignments', showId, personId],
    enabled: isApplicable,
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

  return {
    assignedClassIds,
    error: query.error instanceof Error ? query.error : replicationError,
    isLoading: isApplicable && (query.isLoading || isWaitingForFirstSync),
    retry: () => {
      void syncTable('judge_assignments').then(() => query.refetch());
    },
  };
}
