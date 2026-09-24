import { useMemo } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useUpcomingJudgeAssignments } from '@/hooks/queries/useJudgeAnalyticsQuery';
import { useShowStore } from '@/store/showStore';
import { UserRole } from '@/types/auth-types';
import { selectComposeShows, type ComposeShowOption } from '../messageComposeShows';

/**
 * The Message Center composer's show options (MYK9-641): the shows this person
 * may post to, per `selectComposeShows`. A judge's assignments are read only for
 * a judge with a resolved person id; until that read answers, their context
 * shows still count.
 */
export function useMessageComposeShows(contextShowIds: readonly string[]): ComposeShowOption[] {
  const { userWithRoles, hasRole } = useAuthContext();
  const shows = useShowStore(s => s.shows);
  const isJudge = hasRole(UserRole.JUDGE);
  const { data: assignments } = useUpcomingJudgeAssignments(
    isJudge ? userWithRoles?.databaseUserId : undefined
  );

  return useMemo(() => {
    const assigned = (assignments ?? []).map(row => ({ id: row.show_id, name: row.show_name }));
    return selectComposeShows(shows, { assigned, contextShowIds }, userWithRoles, hasRole);
  }, [assignments, contextShowIds, hasRole, shows, userWithRoles]);
}
