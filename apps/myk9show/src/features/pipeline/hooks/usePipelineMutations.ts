import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { checklistService, pipelineService, activityLogService } from '../services';
import type { PipelineStage } from '../types';

export function usePipelineMutations(trialId: string) {
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.trialChecklist(trialId) });
    qc.invalidateQueries({ queryKey: queryKeys.trialActivityLog(trialId) });
    qc.invalidateQueries({ queryKey: queryKeys.trial(trialId) });
    qc.invalidateQueries({ queryKey: queryKeys.pipelineOverview });
  };

  const toggleItem = useMutation({
    mutationFn: (args: { itemKey: string; completed: boolean; userId: string }) =>
      checklistService.toggleItem(trialId, args.itemKey, args.completed, args.userId),
    onSuccess: invalidate,
  });

  const addCustomItem = useMutation({
    mutationFn: (args: {
      label: string;
      stage: PipelineStage;
      userId: string;
      userName: string;
    }) => {
      const itemKey = `custom_${crypto.randomUUID()}`;
      return checklistService
        .upsert({
          trial_id: trialId,
          stage: args.stage,
          item_key: itemKey,
          item_type: 'custom',
          label: args.label,
          completed: false,
        })
        .then(() =>
          activityLogService.log({
            trial_id: trialId,
            action_type: 'custom_item_added',
            description: `Custom item added: "${args.label}"`,
            actor_id: args.userId,
            actor_name: args.userName,
          })
        );
    },
    onSuccess: invalidate,
  });

  const deleteCustomItem = useMutation({
    mutationFn: (args: { itemKey: string; userId: string; userName: string }) =>
      checklistService.deleteCustomItem(trialId, args.itemKey).then(() =>
        activityLogService.log({
          trial_id: trialId,
          action_type: 'custom_item_removed',
          description: 'Custom checklist item removed',
          actor_id: args.userId,
          actor_name: args.userName,
        })
      ),
    onSuccess: invalidate,
  });

  const advanceStage = useMutation({
    mutationFn: (args: {
      currentStage: PipelineStage;
      userId: string;
      userName: string;
    }) =>
      pipelineService.advanceStage(trialId, args.currentStage, args.userId, args.userName),
    onSuccess: invalidate,
  });

  const revertStage = useMutation({
    mutationFn: (args: {
      targetStage: PipelineStage;
      userId: string;
      userName: string;
    }) =>
      pipelineService.revertStage(trialId, args.targetStage, args.userId, args.userName),
    onSuccess: invalidate,
  });

  return { toggleItem, addCustomItem, deleteCustomItem, advanceStage, revertStage };
}
