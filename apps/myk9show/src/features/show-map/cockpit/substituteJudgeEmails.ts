/**
 * MYK9-2161: the secretary's "email the exhibitors who were told no judge yet" action.
 *
 * Online-only server actions (owner decision 2026-11-17: an explicit tap, never automatic).
 * Both RPCs repeat set_class_judge's authorization (site admin or the show's office manager),
 * so a refused caller gets 42501 here too.
 */
import { supabase } from '@/services/database/supabaseClient';

export interface SubstituteJudgeEmailOffer {
  /** People who were told "not named yet" and have not been followed up. */
  pendingCount: number;
  /** People already followed up since the substitute was confirmed. */
  sentCount: number;
}

function toCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export async function fetchSubstituteJudgeEmailOffer(
  classId: string
): Promise<SubstituteJudgeEmailOffer> {
  const { data, error } = await supabase.rpc('substitute_judge_email_offer', {
    p_class_id: classId,
  });
  if (error) throw error;
  const row = (data ?? {}) as Record<string, unknown>;
  return { pendingCount: toCount(row.pending_count), sentCount: toCount(row.sent_count) };
}

/** @returns how many people were queued an email. */
export async function queueSubstituteJudgeEmails(classId: string): Promise<number> {
  const { data, error } = await supabase.rpc('queue_substitute_judge_emails', {
    p_class_id: classId,
  });
  if (error) throw error;
  return toCount(data);
}
