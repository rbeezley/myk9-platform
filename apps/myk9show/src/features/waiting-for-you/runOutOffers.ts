import type { WaitingList } from './types';

/** The waitlist row facts the rule reads (`ReplicatedWaitlistEntry` satisfies it). */
export interface RunOutOfferEntry {
  id: string;
  classId: string;
  status: string | null | undefined;
  /** When the offer was made (the server's `offered_at`). */
  offeredAt?: string | null | undefined;
  /** On an expired offer, the offer that refilled its spot (the server's `refilled_by_offer_id`). */
  refilledByOfferId?: string | null | undefined;
}

const isExpired = (entry: RunOutOfferEntry) => (entry.status ?? '').toLowerCase() === 'expired';

/**
 * Offers that ran out and whose spot nobody has been offered since ("an offer has run out"):
 * the rows of the Waitlist tab's run-out list, and its count.
 *
 * Which offer refilled which is the server's answer, never worked out here: when an offer is made,
 * `promote_waitlist_entry_internal` marks the expired offer in the class whose spot it refills
 * (the earliest made, MYK9-1988) with the new offer's id. The mark is on the expired row itself,
 * so it holds whatever the new offer became since (open, accepted, paid, run out, or deleted).
 * A refill that ran out is an expired offer of its own and counts until it is refilled.
 *
 * Rows come in the order the offers were made, oldest first.
 */
export function findRunOutOffers<Row extends RunOutOfferEntry>(
  waitlist: readonly Row[]
): WaitingList<Row> {
  const rows = waitlist
    .filter(entry => isExpired(entry) && !entry.refilledByOfferId)
    .sort(
      (a, b) => (a.offeredAt ?? '').localeCompare(b.offeredAt ?? '') || a.id.localeCompare(b.id)
    );
  return { count: rows.length, rows };
}
