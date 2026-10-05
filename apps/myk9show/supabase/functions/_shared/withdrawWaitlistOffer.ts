/**
 * The secretary's "Withdraw offer" (MYK9-1001): the decision behind the
 * withdraw-waitlist-offer edge function, with its I/O injected so it can be
 * tested without Deno, Stripe or a database.
 *
 * It closes an open offer exactly as an expiry or an exhibitor's decline does
 * (expireWaitlistOffer: the Stripe checkout page is expired first, then the
 * pending-payment entry becomes promotion-expired, then the waitlist row takes
 * its terminal status), so the seat is free and nobody can still pay for it.
 * Only the terminal status differs: 'withdrawn', so the exhibitor's My Shows
 * card can say the club took the offer back instead of "You declined".
 *
 * Authorization is promote_waitlist_entry's: the show's secretary, the
 * show's club admin, or a site admin.
 */

import type { ExpiredWaitlistOffer } from './waitlistExpiration.ts';

export interface WithdrawableOffer extends ExpiredWaitlistOffer {
  status: string | null;
  offer_expires_at: string | null;
  show_id: string | null;
  club_id: string | null;
}

export interface WithdrawWaitlistOfferDeps {
  /** The row and its show, read with the service role. `'error'` on a failed read. */
  loadOffer(id: string): Promise<WithdrawableOffer | null | 'error'>;
  /** promote_waitlist_entry's authorization, asked as the caller. */
  canManageShow(showId: string, clubId: string | null): Promise<boolean>;
  /** The row again, only if it is still an open, unexpired offer. */
  recheckOpenOffer(id: string, nowIso: string): Promise<ExpiredWaitlistOffer | null | 'error'>;
  expire(
    offer: ExpiredWaitlistOffer,
    terminalStatus: 'expired' | 'withdrawn'
  ): Promise<'expired' | 'paid' | 'error'>;
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
  reconciling: 'A payment for this offer is being confirmed. Try again in a few minutes.',
  notOffered: 'This dog has not been offered a spot.',
  failed: 'We could not withdraw this offer. Please try again.',
} as const;

const closed = (status: string): WithdrawWaitlistOfferResult => ({
  httpStatus: 200,
  body: { status, already_closed: true },
});

export async function withdrawWaitlistOffer(
  deps: WithdrawWaitlistOfferDeps,
  waitlistEntryId: string,
  nowIso: string
): Promise<WithdrawWaitlistOfferResult> {
  const offer = await deps.loadOffer(waitlistEntryId);
  if (offer === 'error') return { httpStatus: 500, body: { error: WITHDRAW_MESSAGES.failed } };
  // An outsider gets the same answer as a missing row: no hint that it exists.
  if (!offer || !offer.show_id || !(await deps.canManageShow(offer.show_id, offer.club_id))) {
    return { httpStatus: 404, body: { error: WITHDRAW_MESSAGES.notFound } };
  }

  if (offer.status && CLOSED_STATUSES.has(offer.status)) return closed(offer.status);
  if (offer.status === 'accepted') {
    return { httpStatus: 409, body: { error: WITHDRAW_MESSAGES.paid } };
  }
  if (offer.status !== 'offered') {
    return { httpStatus: 409, body: { error: WITHDRAW_MESSAGES.notOffered } };
  }
  if (!offer.promoted_entry_id || !offer.offer_expires_at) {
    return { httpStatus: 409, body: { error: WITHDRAW_MESSAGES.reconciling } };
  }

  // The deadline already passed and the expiry job has not run yet: close it
  // as the expiry it is, not as a withdrawal.
  if (offer.offer_expires_at <= nowIso) {
    const lapsed = await deps.expire(offer, 'expired');
    if (lapsed === 'paid')
      return { httpStatus: 409, body: { error: WITHDRAW_MESSAGES.reconciling } };
    if (lapsed === 'error') return { httpStatus: 500, body: { error: WITHDRAW_MESSAGES.failed } };
    return closed('expired');
  }

  // Re-read the open offer immediately before touching Stripe, so a webhook or
  // expiry that landed since the first read is never overwritten.
  const open = await deps.recheckOpenOffer(waitlistEntryId, nowIso);
  if (open === 'error') return { httpStatus: 500, body: { error: WITHDRAW_MESSAGES.failed } };
  if (!open) {
    const now = await deps.loadOffer(waitlistEntryId);
    if (now !== 'error' && now?.status === 'accepted') {
      return { httpStatus: 409, body: { error: WITHDRAW_MESSAGES.paid } };
    }
    return closed(now !== 'error' && now?.status ? now.status : 'expired');
  }

  const result = await deps.expire(open, 'withdrawn');
  if (result === 'paid') return { httpStatus: 409, body: { error: WITHDRAW_MESSAGES.reconciling } };
  if (result === 'error') return { httpStatus: 500, body: { error: WITHDRAW_MESSAGES.failed } };
  return { httpStatus: 200, body: { status: 'withdrawn', already_closed: false } };
}
