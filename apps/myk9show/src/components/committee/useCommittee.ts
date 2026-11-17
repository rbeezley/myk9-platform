/**
 * One Event Committee list (the club's, or one show's own): the read and the add, remove and move
 * mutations, with a plain-words failure message. The lists are online-only admin data, so this is
 * React Query over the service, not a replicated table.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@/lib/notifications';
import {
  addCommitteeMember,
  getCommittee,
  moveCommitteeMember,
  removeCommitteeMember,
} from '@/services/database/club-memberships/committee';
import type { CommitteeScope, CommitteeTarget } from '@/types/committee-types';

/** Every committee read starts with this key, so one invalidation refreshes them all. */
export const COMMITTEE_QUERY_KEY = 'committee';

export function committeeScopeKey(scope: CommitteeScope) {
  return scope.kind === 'club'
    ? ([COMMITTEE_QUERY_KEY, 'club', scope.clubId] as const)
    : ([COMMITTEE_QUERY_KEY, 'show', scope.showId] as const);
}

export function useCommittee(scope: CommitteeScope) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: committeeScopeKey(scope),
    queryFn: () => getCommittee(scope),
  });
  const members = query.data ?? [];

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [COMMITTEE_QUERY_KEY] });
    void queryClient.invalidateQueries({ queryKey: ['public-show-committee'] });
  };

  const add = useMutation({
    mutationFn: (target: CommitteeTarget) =>
      addCommitteeMember(
        scope,
        target,
        members.reduce((max, member) => Math.max(max, member.sortOrder), -1) + 1
      ),
    onSuccess: refresh,
    onError: () =>
      notifications.error('That person is already on the committee, or we could not save it.'),
  });

  const remove = useMutation({
    mutationFn: (memberId: string) => removeCommitteeMember(scope, memberId),
    onSuccess: refresh,
    onError: () => notifications.error("We couldn't remove that member. Please try again."),
  });

  const move = useMutation({
    mutationFn: ({ memberId, direction }: { memberId: string; direction: 'up' | 'down' }) =>
      moveCommitteeMember(scope, members, memberId, direction),
    // Settled, not success: a partly failed renumber must still reload the true order.
    onSettled: refresh,
    onError: () => notifications.error("We couldn't change the order. Please try again."),
  });

  return {
    members,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    add: (target: CommitteeTarget) => add.mutate(target),
    remove: (memberId: string) => remove.mutate(memberId),
    move: (memberId: string, direction: 'up' | 'down') => move.mutate({ memberId, direction }),
    busy: add.isPending || remove.isPending || move.isPending,
  };
}
