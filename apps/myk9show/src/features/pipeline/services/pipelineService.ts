import { supabase } from '@/services/database/supabaseClient';
import type { PipelineStage } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const pipelineService = {
  async advanceStage(
    trialId: string,
    currentStage: PipelineStage,
    userId: string,
    userName: string
  ): Promise<PipelineStage> {
    if (currentStage >= 6) throw new Error('Trial is already closed');
    const nextStage = (currentStage + 1) as PipelineStage;

    const { error: updateError } = await db
      .from('trials')
      .update({ pipeline_stage: nextStage })
      .eq('id', trialId);

    if (updateError) throw updateError;

    const { error: logError } = await db.from('activity_log').insert({
      trial_id: trialId,
      action_type: 'stage_transition',
      description: `Trial moved to stage ${nextStage}`,
      actor_id: userId,
      actor_name: userName,
      metadata: { from_stage: currentStage, to_stage: nextStage },
    });

    if (logError) {
      console.error('Failed to log stage transition:', logError);
    }

    return nextStage;
  },

  async revertStage(
    trialId: string,
    targetStage: PipelineStage,
    userId: string,
    userName: string
  ): Promise<void> {
    const { error: updateError } = await db
      .from('trials')
      .update({ pipeline_stage: targetStage })
      .eq('id', trialId);

    if (updateError) throw updateError;

    const { error: logError } = await db.from('activity_log').insert({
      trial_id: trialId,
      action_type: 'stage_transition',
      description: `Trial reverted to stage ${targetStage}`,
      actor_id: userId,
      actor_name: userName,
      metadata: { to_stage: targetStage, reverted: true },
    });

    if (logError) {
      console.error('Failed to log stage revert:', logError);
    }
  },
};
