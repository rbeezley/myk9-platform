/**
 * The secretary's "Withdraw offer" (MYK9-1001): the decision behind the
 * withdraw-waitlist-offer edge function, with its I/O injected so it can be
 * tested without Deno, Stripe or a database.
 *
 * One protocol, database first (owner decision, Codex round 6 on #2772):
 *   1. withdraw_waitlist_offer_internal, ONE transaction under a row lock: it
 *      closes the offer only if it is still 'offered' (withdrawn, or expired if
 *      its deadline passed; a mail-in offer is always withdrawn), ends the
 *      pending-payment entry, and writes the exhibitor's notices only when that
 *      call made the transition. Two concurrent withdrawals therefore notify
 *      once; the second answers 'already_closed'. `notified` comes from that
 *      result, never from a check made here.
 *   2. Then expire EVERY open payment link for the entry, read after step 1
 *      committed. A link cannot be created across step 1: the payment-link
 *      insert trigger locks the same waitlist row (FOR SHARE) and refuses a
 *      closed offer. So a link made before the withdrawal is found here, and
 *      one attempted after it is refused.
 *   A checkout that completes between the two steps pays for an entry that is
 *   already promotion-expired on a link still 'open': stripe-webhook treats it
 *   as an inactive entry, queues a refund request for human approval and
 *   alerts (never an automatic refund). `checkout_closed: false` tells the
 *   secretary so.
 *
 * Authorization is promote_waitlist_entry's, asked as the caller: the show's
 * secretary, the show's club admin, or a site admin.
 */

/** What withdraw_waitlist_offer_internal returns (jsonb). */
export interface DatabaseWithdrawal {
  result: 'withdrawn' | 'expired' | 'already_closed' | 'paid' | 'not_found';
  status: string | null;
  notified: boolean;
  event_id?: string | null;
  event_type?: 'withdrawn' | 'expired' | null;
}

export interface WithdrawableOffer {
  id: string;
  status: string | null;
  promoted_entry_id: string | null;
  show_id: string | null;
  club_id: string | null;
}

export interface WithdrawWaitlistOfferDeps {
  /** The row and its show, read with the service role. `'error'` on a failed read. */
  loadOffer(id: string): Promise<WithdrawableOffer | null | 'error'>;
  /** promote_waitlist_entry's authorization, asked as the caller. */
  canManageShow(showId: string, clubId: string | null): Promise<boolean>;
  /** withdraw_waitlist_offer_internal: step 1. `'error'` when the call failed. */
  withdrawInDatabase(id: string): Promise<DatabaseWithdrawal | 'error'>;
  /** expireOpenPaymentLinksForEntry, read after step 1 committed: step 2. */
  closePaymentPages(entryId: string): Promise<'expired' | 'paid' | 'error'>;
  /** Hand a queued email/push event to push-trigger-waitlist (the cron retries a failure). */
  dispatchEvent(event: {
    eventId: string;
    eventType: 'withdrawn' | 'expired';
    waitlistEntryId: string;
  }): Promise<void>;
}

export interface WithdrawWaitlistOfferResult {
  httpStatus: number;
  body: Record<string, unknown>;
}

/** Statuses after which there is no offer left to withdraw. */
const CLOSED_STATUSES = new Set(['expired', 'declined', 'withdrawn']);

export const WITHDRAW_MESSAGES = {
  notFound: 'This offer was not found.',
  paid: 'This dog has already paid for the spot, so the offer cannot be withdrawn.',
  notOffered: 'This dog has not been offered a spot.',
  failed: 'We could not withdraw this offer. Please try again.',
} as const;

// Every answer names its result, so the client never infers one (Codex P2 on #2772):
// 'withdrawn' | 'expired' | 'already_closed' on 200, 'paid' on 409, 'not_found' on 404.
const closed = (status: string | null): WithdrawWaitlistOfferResult => ({
  httpStatus: 200,
  body: { result: 'already_closed', status, already_closed: true, notified: false },
});
const notFound: WithdrawWaitlistOfferResult = {
  httpStatus: 404,
  body: { result: 'not_found', error: WITHDRAW_MESSAGES.notFound },
};
const alreadyPaid: WithdrawWaitlistOfferResult = {
  httpStatus: 409,
  body: { result: 'paid', error: WITHDRAW_MESSAGES.paid },
};

export async function withdrawWaitlistOffer(
  deps: WithdrawWaitlistOfferDeps,
  waitlistEntryId: string
): Promise<WithdrawWaitlistOfferResult> {
  const offer = await deps.loadOffer(waitlistEntryId);
  if (offer === 'error') return { httpStatus: 500, body: { error: WITHDRAW_MESSAGES.failed } };
  // An outsider gets the same answer as a missing row: no hint that it exists.
  if (!offer || !offer.show_id || !(await deps.canManageShow(offer.show_id, offer.club_id))) {
    return notFound;
  }

  // Nothing open: answer without touching Stripe.
  if (offer.status && CLOSED_STATUSES.has(offer.status)) return closed(offer.status);
  if (offer.status === 'accepted') return alreadyPaid;
  if (offer.status !== 'offered') {
    return { httpStatus: 409, body: { error: WITHDRAW_MESSAGES.notOffered } };
  }

  // Step 1: the transition and its notices, atomically.
  const outcome = await deps.withdrawInDatabase(waitlistEntryId);
  if (outcome === 'error') return { httpStatus: 500, body: { error: WITHDRAW_MESSAGES.failed } };

  switch (outcome.result) {
    case 'not_found':
      return notFound;
    case 'paid':
      return alreadyPaid;
    case 'already_closed':
      return closed(outcome.status);
    case 'withdrawn':
    case 'expired':
      break;
  }

  // Step 2: close every checkout page for the entry, now that no new one can be made.
  let checkoutClosed = true;
  if (offer.promoted_entry_id) {
    const pages = await deps.closePaymentPages(offer.promoted_entry_id);
    if (pages !== 'expired') {
      checkoutClosed = false;
      console.error(
        `withdraw-waitlist-offer: checkout for entry ${offer.promoted_entry_id} not closed (${pages}); ` +
          'a payment on it is an inactive entry and goes to the refund queue'
      );
    }
  }

  if (outcome.event_id && outcome.event_type) {
    try {
      await deps.dispatchEvent({
        eventId: outcome.event_id,
        eventType: outcome.event_type,
        waitlistEntryId,
      });
    } catch (error) {
      // The event is durable: cron-waitlist-expiration retries its delivery.
      console.error(
        `withdraw-waitlist-offer: ${outcome.event_type} event ${outcome.event_id} left for retry:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  return {
    httpStatus: 200,
    body: {
      result: outcome.result,
      status: outcome.result,
      already_closed: outcome.result === 'expired',
      notified: outcome.notified === true,
      checkout_closed: checkoutClosed,
    },
  };
}
