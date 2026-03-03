import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { checklistService, pipelineService, activityLogService } from '../services';
import type { PipelineStage } from '../types';

export function usePipelineMutations(trialId: string) {
  const qc = useQueryClient();

  const toggleItem = useMutation({
    mutationFn: (args: { itemKey: string; completed: boolean; userId: string }) =>
      checklistService.toggleItem(trialId, args.itemKey, args.completed, args.userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.trialChecklist(trialId) });
    },
  });

  const addCustomItem = useMutation({
    mutationFn: (args: {
      label: string;
      stage: PipelineStage;
      userId: string;
      userName: string;
    }) => {
      const itemKey = `custom_${crypto.randomUUID()}`;
      return Promise.all([
        checklistService.upsert({
          trial_id: trialId,
          stage: args.stage,
          item_key: itemKey,
          item_type: 'custom',
          label: args.label,
          completed: false,
        }),
        activityLogService.log({
          trial_id: trialId,
          action_type: 'custom_item_added',
          description: `Custom item added: "${args.label}"`,
          actor_id: args.userId,
          actor_name: args.userName,
        }),
      ]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.trialChecklist(trialId) });
      qc.invalidateQueries({ queryKey: queryKeys.trialActivityLog(trialId) });
    },
  });

  const deleteCustomItem = useMutation({
    mutationFn: (args: { itemKey: string; userId: string; userName: string }) =>
      Promise.all([
        checklistService.deleteCustomItem(trialId, args.itemKey),
        activityLogService.log({
          trial_id: trialId,
          action_type: 'custom_item_removed',
          description: 'Custom checklist item removed',
          actor_id: args.userId,
          actor_name: args.userName,
        }),
      ]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.trialChecklist(trialId) });
      qc.invalidateQueries({ queryKey: queryKeys.trialActivityLog(trialId) });
    },
  });

  const advanceStage = useMutation({
    mutationFn: (args: {
      currentStage: PipelineStage;
      userId: string;
      userName: string;
    }) =>
      pipelineService.advanceStage(trialId, args.currentStage, args.userId, args.userName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.trialChecklist(trialId) });
      qc.invalidateQueries({ queryKey: queryKeys.trialActivityLog(trialId) });
      qc.invalidateQueries({ queryKey: queryKeys.trial(trialId) });
    },
  });

  const revertStage = useMutation({
    mutationFn: (args: {
      targetStage: PipelineStage;
      userId: string;
      userName: string;
    }) =>
      pipelineService.revertStage(trialId, args.targetStage, args.userId, args.userName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.trialChecklist(trialId) });
      qc.invalidateQueries({ queryKey: queryKeys.trialActivityLog(trialId) });
      qc.invalidateQueries({ queryKey: queryKeys.trial(trialId) });
    },
  });

  return { toggleItem, addCustomItem, deleteCustomItem, advanceStage, revertStage };
}
