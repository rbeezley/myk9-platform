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
 * What a withdrawal did, as the server decided it (withdraw_waitlist_offer_internal):
 *   withdrawn       closed now; `notified` says whether the exhibitor was told
 *   expired         its deadline had already passed: closed as an expiry, with the
 *                   expiry notice (`notified`)
 *   already_closed  someone or something closed it first; nothing was sent
 *   paid            the dog paid; the offer stands
 *   not_found       no such offer (or not one this secretary manages)
 * Never collapsed to a boolean: `already_closed` sends nothing on purpose, which is
 * not a failed notice (Codex P2 on #2772).
 */
export type WithdrawOfferOutcome =
  | { result: 'withdrawn'; notified: boolean }
  | { result: 'expired'; notified: boolean }
  | { result: 'already_closed'; status: string | null }
  | { result: 'paid' }
  | { result: 'not_found' };

type ServerAnswer = { result?: unknown; status?: unknown; notified?: unknown; error?: unknown };

/** The server's answer as an outcome, or null when it names no result this client knows. */
function toOutcome(answer: ServerAnswer | null | undefined): WithdrawOfferOutcome | null {
  switch (answer?.result) {
    case 'withdrawn':
    case 'expired':
      return { result: answer.result, notified: answer.notified === true };
    case 'already_closed':
      return {
        result: 'already_closed',
        status: typeof answer.status === 'string' ? answer.status : null,
      };
    case 'paid':
      return { result: 'paid' };
    case 'not_found':
      return { result: 'not_found' };
    default:
      return null;
  }
}

/**
 * Withdraw an open offer (withdraw-waitlist-offer): the Stripe page is closed, then
 * the database closes the offer and tells the exhibitor in one transaction. Resolves
 * the server's {@link WithdrawOfferOutcome}; a refusal with no result of its own (a
 * payment being confirmed, a failure) throws {@link WaitlistOfferNotWithdrawnError}
 * with the server's reason.
 */
export async function withdrawWaitlistOffer(
  waitlistEntryId: string
): Promise<WithdrawOfferOutcome> {
  const { data, error } = await supabase.functions.invoke('withdraw-waitlist-offer', {
    body: { waitlist_entry_id: waitlistEntryId },
  });

  if (error) {
    let answer: ServerAnswer | undefined;
    const context = (error as { context?: Response }).context;
    try {
      answer = context ? await context.json() : undefined;
    } catch {
      answer = undefined;
    }
    // 'paid' and 'not_found' are answers, not failures: nothing changed to refresh.
    const refused = toOutcome(answer);
    if (refused) return refused;
    throw new WaitlistOfferNotWithdrawnError(
      typeof answer?.error === 'string' && answer.error
        ? answer.error
        : WITHDRAW_OFFER_FAILED_MESSAGE
    );
  }

  const outcome = toOutcome(data as ServerAnswer | null);
  if (!outcome) throw new WaitlistOfferNotWithdrawnError(WITHDRAW_OFFER_FAILED_MESSAGE);

  // Every 200 (withdrawn, closed as expired, or already closed) changed or confirmed the rows.
  await refreshOfferRowsInReplica(waitlistEntryId);
  return outcome;
}
