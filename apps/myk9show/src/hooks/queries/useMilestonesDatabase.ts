/**
 * React Query hooks for user milestones (Phase 4.2 — Tip Banners).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getUserMilestones,
  achieveMilestone,
  dismissMilestoneTip,
} from '@/services/database/queries/milestoneQueries';
import type { UserMilestone } from '@/services/database/queries/milestoneQueries';
import { cacheStrategies } from '@/lib/queryClient';

export const milestoneQueryKeys = {
  all: ['milestones'] as const,
  user: () => [...milestoneQueryKeys.all, 'user'] as const,
};

/** Fetch all milestones for the current user. */
export const useMilestonesQuery = (enabled = true) => {
  return useQuery({
    queryKey: milestoneQueryKeys.user(),
    queryFn: async () => {
      const { data, error } = await getUserMilestones();
      if (error) throw error;
      return data;
    },
    enabled,
    ...cacheStrategies.moderate,
  });
};

/** Achieve a milestone (upsert). */
export const useAchieveMilestoneMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (milestoneKey: string) => {
      const { data, error } = await achieveMilestone(milestoneKey);
      if (error) throw error;
      return data;
    },
    onSuccess: newMilestone => {
      queryClient.setQueryData<UserMilestone[]>(milestoneQueryKeys.user(), old => {
        if (!old || !newMilestone) return old ?? [];
        const existing = old.findIndex(m => m.milestone_key === newMilestone.milestone_key);
        if (existing >= 0) {
          const updated = [...old];
          updated[existing] = newMilestone;
          return updated;
        }
        return [newMilestone, ...old];
      });
    },
  });
};

/** Dismiss a tip banner for a milestone. */
export const useDismissMilestoneMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (milestoneKey: string) => {
      const { error } = await dismissMilestoneTip(milestoneKey);
      if (error) throw error;
      return milestoneKey;
    },
    onMutate: async milestoneKey => {
      // Optimistic update — immediately hide the tip
      await queryClient.cancelQueries({ queryKey: milestoneQueryKeys.user() });
      const previous = queryClient.getQueryData<UserMilestone[]>(milestoneQueryKeys.user());
      queryClient.setQueryData<UserMilestone[]>(milestoneQueryKeys.user(), old =>
        old?.map(m => (m.milestone_key === milestoneKey ? { ...m, tip_dismissed: true } : m))
      );
      return { previous };
    },
    onError: (_err, _key, context) => {
      if (context?.previous) {
        queryClient.setQueryData(milestoneQueryKeys.user(), context.previous);
      }
    },
  });
};
