import { supabase } from '@/lib/supabase';

export async function denyPullRefundDecision(entryId: string): Promise<void> {
  const { error } = await supabase.rpc('set_entry_refund_decision', {
    p_entry_id: entryId,
    p_decision: 'denied',
  });

  if (error) throw error;
}
