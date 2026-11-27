// MYK9-2448: closing a prior payment link app-side, with the write checked.
//
// Every caller has already seen Stripe answer that the prior session is no
// longer open, so its URL cannot take a payment. A failed write would still
// leave the row reading 'open' beside the new link: two "open" links for the
// same entries in the secretary's view and in the webhook's latch. So a failed
// write refuses the re-request (fail closed); a retry re-reads Stripe, finds the
// session closed and repeats this write.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

export const PRIOR_LINK_NOT_CLOSED_MESSAGE =
  'Could not close an existing payment link. Please try again.';

/** Marks the prior link expired; false (after logging the detail) when the write failed. */
export async function markPriorLinkExpired(
  supabase: SupabaseClient,
  linkId: string,
  nowIso: string
): Promise<boolean> {
  const { error } = await supabase
    .from('entry_payment_links')
    .update({ status: 'expired', updated_at: nowIso })
    .eq('id', linkId);
  if (error) {
    console.error(`Could not mark prior payment link ${linkId} expired:`, error);
    return false;
  }
  return true;
}
