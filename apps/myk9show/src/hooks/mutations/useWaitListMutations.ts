import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys } from '@/lib/queryClient';

export function useWaitListMutations(showId: string) {
  const queryClient = useQueryClient();

  const invalidateShow = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.show(showId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.showEntries(showId) });
  };

  const promoteEntry = useMutation({
    mutationFn: async ({
      waitlistEntryId,
      deadlineHours = 24,
    }: {
      waitlistEntryId: string;
      deadlineHours?: number;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('promote_waitlist_entry', {
        p_waitlist_entry_id: waitlistEntryId,
        p_deadline_hours: deadlineHours,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidateShow,
  });

  const removeFromWaitList = useMutation({
    mutationFn: async (waitlistEntryId: string) => {
      const { error } = await supabase.from('waitlist_entries').delete().eq('id', waitlistEntryId);
      if (error) throw error;
    },
    onSuccess: invalidateShow,
  });

  const bulkPromote = useMutation({
    mutationFn: async ({
      entryIds,
      deadlineHours = 24,
    }: {
      entryIds: string[];
      deadlineHours?: number;
    }) => {
      const results: string[] = [];
      for (const id of entryIds) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).rpc('promote_waitlist_entry', {
          p_waitlist_entry_id: id,
          p_deadline_hours: deadlineHours,
        });
        if (error) throw error;
        results.push(data as string);
      }
      return results;
    },
    onSuccess: invalidateShow,
  });

  const withdrawFromWaitList = useMutation({
    mutationFn: async (waitlistEntryId: string) => {
      const { error } = await supabase.from('waitlist_entries').delete().eq('id', waitlistEntryId);
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
      const { error } = await supabase
        .from('judge_assignments')
        .update({ person_id: toJudgeId })
        .eq('class_id', classId)
        .eq('show_id', showId)
        .eq('person_id', fromJudgeId);
      if (error) throw error;
    },
    onSuccess: invalidateShow,
  });

  const closeWaitList = useMutation({
    mutationFn: async (classIds: string[]) => {
      const { error } = await supabase
        .from('waitlist_entries')
        .update({ status: 'expired' })
        .in('class_id', classIds)
        .eq('status', 'waiting');
      if (error) throw error;
    },
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
