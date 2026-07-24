import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  getActiveJudgeAssignmentsForShow,
  subscribeToJudgeAssignmentChanges,
} from '@/services/database/judges';
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
  const personId =
    !user?.is_anonymous && hasRole(UserRole.JUDGE) ? userWithRoles?.databaseUserId : undefined;

  useEffect(() => {
    if (!showId || !personId) return;
    return subscribeToJudgeAssignmentChanges(() => {
      void queryClient.invalidateQueries({
        queryKey: ['at-show', 'judge-assignments', showId, personId],
      });
    });
  }, [personId, queryClient, showId]);

  const query = useQuery({
    queryKey: ['at-show', 'judge-assignments', showId, personId],
    enabled: Boolean(showId && personId),
    queryFn: () => getActiveJudgeAssignmentsForShow(showId as string, personId as string),
  });

  const assignedClassIds = useMemo(
    () =>
      new Set(
        (query.data ?? [])
          .map(assignment => assignment.classId)
          .filter((classId): classId is string => Boolean(classId))
      ),
    [query.data]
  );

  return {
    assignedClassIds,
    error: query.error instanceof Error ? query.error : null,
    isLoading: query.isLoading,
    retry: () => {
      void query.refetch();
    },
  };
}
