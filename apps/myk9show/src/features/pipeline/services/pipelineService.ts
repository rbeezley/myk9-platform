import { supabase } from '@/services/database/supabaseClient';
import { activityLogService } from './activityLogService';
import type { PipelineStage, ActivityActionType } from '../types';

/** Shared stage update: updates trial + logs the transition in parallel */
async function updateStage(
  trialId: string,
  targetStage: PipelineStage,
  userId: string,
  userName: string,
  description: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const [updateResult, logResult] = await Promise.allSettled([
    supabase.from('trials').update({ pipeline_stage: targetStage }).eq('id', trialId),
    activityLogService.log({
      trial_id: trialId,
      action_type: 'stage_transition' as ActivityActionType,
      description,
      actor_id: userId,
      actor_name: userName,
      metadata,
    }),
  ]);

  if (updateResult.status === 'rejected') throw updateResult.reason;
  const { error } = updateResult.value;
  if (error) throw error;

  if (logResult.status === 'rejected') {
    console.error('Failed to log stage transition:', logResult.reason);
  }
}

export const pipelineService = {
  async advanceStage(
    trialId: string,
    currentStage: PipelineStage,
    userId: string,
    userName: string
  ): Promise<PipelineStage> {
    if (currentStage >= 6) throw new Error('Trial is already closed');
    const nextStage = (currentStage + 1) as PipelineStage;

    await updateStage(trialId, nextStage, userId, userName, `Trial moved to stage ${nextStage}`, {
      from_stage: currentStage,
      to_stage: nextStage,
    });

    return nextStage;
  },

  async revertStage(
    trialId: string,
    targetStage: PipelineStage,
    userId: string,
    userName: string
  ): Promise<void> {
    await updateStage(
      trialId,
      targetStage,
      userId,
      userName,
      `Trial reverted to stage ${targetStage}`,
      { to_stage: targetStage, reverted: true }
    );
  },
};
