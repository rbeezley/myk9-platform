/**
 * Offer actions the Waitlist tab runs online (MYK9-1001): withdrawing an open
 * offer, and bringing one changed row into the replica once the server has
 * changed it.
 */

import { supabase } from '../supabaseClient';
import {
  replicatedWaitlistEntriesTable,
  rowToWaitlistEntry,
} from '@/services/replication/ReplicatedWaitlistEntriesTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { logger } from '@/services/LoggingService';

export const WITHDRAW_OFFER_FAILED_MESSAGE = 'We could not withdraw this offer. Please try again.';

/** Thrown with the server's own plain-English reason (paid, being confirmed, not found). */
export class WaitlistOfferNotWithdrawnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WaitlistOfferNotWithdrawnError';
  }
}

/**
 * Bring every row an offer action changed on the server into the replica, so
 * the tab shows what the server just did without waiting for the next sync
 * (MYK9-1001): the waitlist row (offered / withdrawn / expired) and the entry
 * the offer created (pending-payment on an offer, promotion-expired after a
 * withdrawal or expiry). The tab's class counts read that entry, so "Offer
 * Spot" appears for a freed seat and never for a seat an offer just took.
 *
 * Both go through the replication tables. The waitlist table is not on the
 * realtime publication, and the tab reads the replica only. The entry uses the
 * entries replica's own server read-back (`refreshServerChangedEntries`),
 * inserting a new entry only when this show's entries are loaded here.
 *
 * Best effort: a failure is logged and the next sync settles the rows.
 */
export async function refreshOfferRowsInReplica(waitlistEntryId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('waitlist_entries')
      .select(
        'id, class_id, dog_id, exhibitor_id, handler_id, position, status, joined_via, offered_at, offer_expires_at, promoted_entry_id, created_at, updated_at'
      )
      .eq('id', waitlistEntryId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return;
    await replicatedWaitlistEntriesTable.set(waitlistEntryId, rowToWaitlistEntry(data));
    if (data.promoted_entry_id) {
      await replicatedEntriesTable.refreshServerChangedEntries([data.promoted_entry_id], {
        insert: 'if-show-loaded',
        reason: 'wait list offer entry changed by the server',
      });
    }
  } catch (err) {
    logger.warn('Offer rows not refreshed in the replica; the next sync will', 'secretary', {
      waitlistEntryId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Withdraw an open offer (withdraw-waitlist-offer): the Stripe page is closed,
 * the pending-payment entry ends, and the row becomes 'withdrawn' (or
 * 'expired' if its deadline had already passed). An offer already closed is a
 * calm success. Anything refused throws {@link WaitlistOfferNotWithdrawnError}
 * with the server's reason.
 *
 * Resolves `notified: false` when the withdrawal succeeded but the exhibitor's
 * notice did not go out (the server never undoes the withdrawal for that).
 */
export async function withdrawWaitlistOffer(
  waitlistEntryId: string
): Promise<{ notified: boolean }> {
  const { data, error } = await supabase.functions.invoke('withdraw-waitlist-offer', {
    body: { waitlist_entry_id: waitlistEntryId },
  });

  if (error) {
    let reason: string | undefined;
    const context = (error as { context?: Response }).context;
    try {
      reason = context ? (await context.json())?.error : undefined;
    } catch {
      reason = undefined;
    }
    throw new WaitlistOfferNotWithdrawnError(
      typeof reason === 'string' && reason ? reason : WITHDRAW_OFFER_FAILED_MESSAGE
    );
  }

  // Every 200 (withdrawn, closed as expired, or already closed) changed or confirmed the rows.
  await refreshOfferRowsInReplica(waitlistEntryId);
  // Only an answer that says so counts as not notified; an already-closed offer sends nothing new.
  return { notified: (data as { notified?: unknown } | null)?.notified !== false };
}
