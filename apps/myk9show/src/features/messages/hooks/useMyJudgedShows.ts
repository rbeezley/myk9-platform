import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useReplicationSync } from '@/hooks/useReplicationSync';
import {
  getActiveJudgeAssignmentShows,
  subscribeToJudgeAssignmentChanges,
  type JudgedShow,
} from '@/services/database/judges';
import { UserRole } from '@/types/auth-types';

export interface MyJudgedShowsResult {
  /** Only meaningful when `status === 'known'`. */
  shows: JudgedShow[];
  /**
   * - `not-judge`: the account holds no judge role (or is an anonymous passcode session).
   * - `unknown`: the set cannot be determined yet. An empty list here means
   *   "not known", never "none": the person row has not resolved (offline cold
   *   boot keeps roles but not `databaseUserId`), the read has not completed, or
   *   the replicated table has not finished a first sync.
   * - `error`: the table's sync failed and nothing is cached.
   * - `known`: `shows` is authoritative, empty included.
   */
  status: 'not-judge' | 'unknown' | 'error' | 'known';
}

const EMPTY: JudgedShow[] = [];

/**
 * The shows the signed-in judge may post show-wide messages to (MYK9-722): every
 * show with a confirmed or invited assignment, read from the replicated
 * `judge_assignments` table so it works offline and includes future shows that
 * are not in the show store. No current-context fallback.
 */
export function useMyJudgedShows(enabled: boolean): MyJudgedShowsResult {
  const queryClient = useQueryClient();
  const { hasRole, user, userWithRoles } = useAuthContext();
  const { status: syncStatus } = useReplicationSync();
  const isJudge = enabled && !user?.is_anonymous && hasRole(UserRole.JUDGE);
  const personId = isJudge ? userWithRoles?.databaseUserId : undefined;
  const queryKey = ['messages', 'judged-shows', personId] as const;
  const tableStatus = syncStatus.tablesStatus.judge_assignments;

  useEffect(() => {
    if (!personId) return;
    return subscribeToJudgeAssignmentChanges(() => {
      void queryClient.invalidateQueries({ queryKey: ['messages', 'judged-shows', personId] });
    });
  }, [personId, queryClient]);

  // The read resolves empty while the first sync is in flight, and nothing in
  // the key changes when it lands, so re-read on the transition to success.
  const lastTableStatus = useRef(tableStatus);
  useEffect(() => {
    const previous = lastTableStatus.current;
    lastTableStatus.current = tableStatus;
    if (!personId || previous === tableStatus || tableStatus !== 'success') return;
    void queryClient.invalidateQueries({ queryKey: ['messages', 'judged-shows', personId] });
  }, [personId, queryClient, tableStatus]);

  const query = useQuery({
    queryKey,
    enabled: Boolean(personId),
    // IndexedDB read: the default "online" mode would pause it offline.
    networkMode: 'always',
    queryFn: () => getActiveJudgeAssignmentShows(personId as string),
  });

  if (!isJudge) return { shows: EMPTY, status: 'not-judge' };
  const shows = query.data ?? EMPTY;
  if (personId && query.isError && query.data === undefined)
    return { shows: EMPTY, status: 'error' };
  if (!personId || query.data === undefined) return { shows: EMPTY, status: 'unknown' };
  if (shows.length > 0 || tableStatus === 'success') return { shows, status: 'known' };
  return { shows: EMPTY, status: tableStatus === 'error' ? 'error' : 'unknown' };
}
