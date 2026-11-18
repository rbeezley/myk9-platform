/**
 * MYK9-2161: the secretary's "email the exhibitors in this class who the new judge is" action.
 *
 * Online-only server actions (owner decision 2026-11-18: an explicit tap, never automatic). The RPCs
 * repeat set_class_judge's authorization, so a caller who may not manage the class gets P0002.
 */
import { supabase } from '@/services/database/supabaseClient';

export interface SubstituteJudgeEmailOffer {
  /** The class's confirmed judge the offer is for. */
  judgeId: string;
  /** Exhibitors with a live entry in the class and an email on file. */
  recipientCount: number;
}

/** @returns the offer, or null when there is nothing to offer for this class. */
export async function fetchSubstituteJudgeEmailOffer(
  classId: string
): Promise<SubstituteJudgeEmailOffer | null> {
  const { data, error } = await supabase.rpc('class_substitute_judge_offer', {
    p_class_id: classId,
  });
  if (error) throw error;
  const row = (data ?? {}) as Record<string, unknown>;
  if (typeof row.judge_id !== 'string') return null;
  return {
    judgeId: row.judge_id,
    recipientCount: typeof row.recipient_count === 'number' ? row.recipient_count : 0,
  };
}

/**
 * @returns how many people were queued an email.
 * `judgeId` is the judge the secretary sees; the server refuses (P0001) if the class has another now.
 */
export async function queueSubstituteJudgeEmails(
  classId: string,
  judgeId: string
): Promise<number> {
  const { data, error } = await supabase.rpc('queue_substitute_judge_emails', {
    p_class_id: classId,
    p_judge_id: judgeId,
  });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export async function dismissSubstituteJudgeEmailOffer(
  classId: string,
  judgeId: string
): Promise<void> {
  const { error } = await supabase.rpc('dismiss_substitute_judge_email_offer', {
    p_class_id: classId,
    p_judge_id: judgeId,
  });
  if (error) throw error;
}
