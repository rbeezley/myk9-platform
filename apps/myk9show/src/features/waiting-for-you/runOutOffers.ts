import type { WaitingList } from './types';

/** The waitlist row facts the rule reads (`ReplicatedWaitlistEntry` satisfies it). */
export interface RunOutOfferEntry {
  id: string;
  classId: string;
  status: string | null | undefined;
  /** When the offer was made (the server's `offered_at`). */
  offeredAt?: string | null | undefined;
  /** The expired offer whose spot this offer refills (the server's `replaces_offer_id`). */
  replacesOfferId?: string | null | undefined;
}

const isExpired = (entry: RunOutOfferEntry) => (entry.status ?? '').toLowerCase() === 'expired';

/**
 * Offers that ran out and whose spot nobody has been offered since ("an offer has run out"):
 * the rows of the Waitlist tab's run-out list, and its count.
 *
 * Which offer refilled which is the server's answer, never worked out here: when an offer is made,
 * `promote_waitlist_entry_internal` records on it the expired offer in the class whose spot it
 * refills (the earliest made, MYK9-1988). So an expired offer stops counting once a row names
 * it, whatever that row became since (open, accepted, paid, or run out itself, which then
 * counts on its own). Pass every waitlist row of the classes in view, whatever its status: a refill
 * row left out would make its expired offer count again.
 *
 * Rows come in the order the offers were made, oldest first.
 */
export function findRunOutOffers<Row extends RunOutOfferEntry>(
  waitlist: readonly Row[]
): WaitingList<Row> {
  const refilled = new Set(
    waitlist.map(entry => entry.replacesOfferId).filter((id): id is string => Boolean(id))
  );
  const rows = waitlist
    .filter(entry => isExpired(entry) && !refilled.has(entry.id))
    .sort(
      (a, b) => (a.offeredAt ?? '').localeCompare(b.offeredAt ?? '') || a.id.localeCompare(b.id)
    );
  return { count: rows.length, rows };
}
