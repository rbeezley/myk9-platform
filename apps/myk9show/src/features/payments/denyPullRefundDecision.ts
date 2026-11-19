import { supabase } from '@/lib/supabase';

/**
 * Records a person's "Deny refund" WITH the reason the exhibitor is told by email (MYK9-2001).
 * The server refuses a blank reason, so the caller never records a denial the exhibitor cannot
 * be given a reason for. Nothing here moves money.
 */
export async function denyPullRefundDecision(entryId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('set_entry_refund_decision', {
    p_entry_id: entryId,
    p_decision: 'denied',
    p_reason: reason.trim(),
  });

  if (error) throw error;
}
