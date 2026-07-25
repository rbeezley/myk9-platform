import { supabase } from '@/lib/supabase';
import { isPullRefundSchemaUnavailable } from './pullRefundSchemaCompatibility';

export type DenyPullRefundDecisionResult = 'saved' | 'unavailable';

export async function denyPullRefundDecision(
  entryId: string
): Promise<DenyPullRefundDecisionResult> {
  const { error } = await supabase.rpc('set_entry_refund_decision', {
    p_entry_id: entryId,
    p_decision: 'denied',
  });

  if (isPullRefundSchemaUnavailable(error)) return 'unavailable';
  if (error) throw error;
  return 'saved';
}
