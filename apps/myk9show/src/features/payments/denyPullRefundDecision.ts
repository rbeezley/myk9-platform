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

export const REFUND_DECISION_APP_UPDATED_MESSAGE =
  'This refund decision could not be saved because myK9Show was updated. Restart the app, then deny the refund again.';

/**
 * MYK9-2293: the server no longer has the `set_entry_refund_decision` signature this bundle calls
 * (PostgREST PGRST202, or Postgres 42883 on a direct call). That is a tab built before a schema
 * change, not a data problem: nothing was saved, and only a restart onto the new build helps.
 */
export function isRefundDecisionRpcMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === 'PGRST202' || code === '42883';
}
