import { supabase } from '@/lib/supabase';

/**
 * Records "Deny refund" with the reason the secretary typed (MYK9-2249). The server refuses a
 * blank reason and emails the dog's owner and the entry's handler; this moves no money.
 */
export async function denyPullRefundDecision(entryId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('set_entry_refund_decision', {
    p_entry_id: entryId,
    p_decision: 'denied',
    p_reason: reason.trim(),
  });

  if (error) throw error;
}
