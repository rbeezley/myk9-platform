import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { reassignClassJudge } from '@/services/database/judges';
import {
  bulkPromoteWaitlistEntries,
  closeWaitlistForClasses,
  promoteWaitlistEntry,
  removeFromWaitlist,
} from '@/services/database/waitlists';

export function useWaitListMutations(showId: string) {
  const queryClient = useQueryClient();

  const invalidateShow = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.show(showId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.showEntries(showId) });
  };

  const promoteEntry = useMutation({
    mutationFn: ({
      waitlistEntryId,
      deadlineHours = 24,
    }: {
      waitlistEntryId: string;
      deadlineHours?: number;
    }) => promoteWaitlistEntry(waitlistEntryId, deadlineHours),
    onSuccess: invalidateShow,
  });

  const removeFromWaitList = useMutation({
    mutationFn: async (waitlistEntryId: string) => {
      const { error } = await removeFromWaitlist(waitlistEntryId);
      if (error) throw error;
    },
    onSuccess: invalidateShow,
  });

  const bulkPromote = useMutation({
    mutationFn: ({
      entryIds,
      deadlineHours = 24,
    }: {
      entryIds: string[];
      deadlineHours?: number;
    }) => bulkPromoteWaitlistEntries(entryIds, deadlineHours),
    onSettled: invalidateShow,
  });

  const withdrawFromWaitList = useMutation({
    mutationFn: async (waitlistEntryId: string) => {
      const { error } = await removeFromWaitlist(waitlistEntryId);
      if (error) throw error;
    },
    onSuccess: invalidateShow,
  });

  const reassignClass = useMutation({
    mutationFn: async ({
      classId,
      fromJudgeId,
      toJudgeId,
    }: {
      classId: string;
      fromJudgeId: string;
      toJudgeId: string;
    }) => {
      await reassignClassJudge(showId, classId, fromJudgeId, toJudgeId);
    },
    onSuccess: invalidateShow,
  });

  const closeWaitList = useMutation({
    mutationFn: (classIds: string[]) => closeWaitlistForClasses(classIds),
    onSuccess: invalidateShow,
  });

  return {
    promoteEntry,
    removeFromWaitList,
    bulkPromote,
    withdrawFromWaitList,
    reassignClass,
    closeWaitList,
  };
}
