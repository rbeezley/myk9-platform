import type { WaitingList } from './types';
import type { WaitlistSpotEntry } from './waitlistSpots';
import { isQueuedWaitlistEntry } from '@/utils/waitlistCountSelectors';

/** An offer whose time to pay ran out. */
export interface ExpiredOfferRow {
  offer: WaitlistSpotEntry;
  classId: string;
  /** False while the offer is past its deadline but the expiry job has not closed it yet. */
  closed: boolean;
}

function status(entry: WaitlistSpotEntry): string {
  return (entry.status ?? 'waiting').toLowerCase();
}

/**
 * Offers that have run out, in classes where a dog is still waiting for the spot they freed.
 *
 * An expired offer is a `waitlist_entries` row the expiry job (`cron-waitlist-expiration`,
 * `_shared/waitlistExpiration.ts`) closed with status 'expired'. Until that job runs it is still
 * 'offered' with `offer_expires_at` in the past (the Offered table says "Not paid in time,
 * closing"); both count, with `closed` telling them apart. A mail-in offer never expires: the job
 * keeps it open for the secretary to resolve, so a past deadline on one is not a lapse.
 *
 * Expired rows are never deleted, so they only count while someone is waiting in the class to be
 * offered the freed spot, and only until another offer is made there: a live open offer issued after
 * the expiry (a later deadline) supersedes it. A dog counts once per class however many of its
 * offers lapsed.
 */
export function findExpiredOffers(input: {
  waitlist: readonly WaitlistSpotEntry[];
  now: Date;
}): WaitingList<ExpiredOfferRow> {
  const classesWithQueue = new Set(
    input.waitlist
      .filter(entry => isQueuedWaitlistEntry({ status: entry.status ?? null }))
      .map(entry => entry.classId)
  );
  const deadlineOf = (entry: WaitlistSpotEntry): number =>
    entry.offerExpiresAt ? Date.parse(entry.offerExpiresAt) : Number.NaN;
  // An offer is superseded once another open offer was issued after it ran out (a later deadline
  // means a later offer); a live open offer with no deadline counts as newer; an expired row with no deadline is never
  // treated as replaced.
  const supersededBy = (offer: WaitlistSpotEntry): boolean => {
    const own = deadlineOf(offer);
    if (!Number.isFinite(own)) return false; // no deadline to compare: cannot show it was replaced
    return input.waitlist.some(other => {
      if (other.classId !== offer.classId || status(other) !== 'offered') return false;
      if (other.id === offer.id) return false;
      const theirs = deadlineOf(other);
      // An offer past its deadline is itself lapsed (counted on its own), not a live replacement.
      if (other.joinedVia !== 'mail_in' && theirs <= input.now.getTime()) return false;
      return !Number.isFinite(theirs) || theirs > own;
    });
  };
  const byDog = new Map<string, ExpiredOfferRow>();
  for (const offer of input.waitlist) {
    if (!classesWithQueue.has(offer.classId)) continue;
    let closed: boolean;
    if (status(offer) === 'expired') {
      closed = true;
    } else if (status(offer) === 'offered' && offer.joinedVia !== 'mail_in') {
      const deadline = deadlineOf(offer);
      if (!Number.isFinite(deadline) || deadline > input.now.getTime()) continue;
      closed = false;
    } else {
      continue;
    }
    if (supersededBy(offer)) continue;
    const key = `${offer.classId}:${offer.dogId}`;
    if (!byDog.has(key)) byDog.set(key, { offer, classId: offer.classId, closed });
  }
  const rows = [...byDog.values()];
  return { count: rows.length, rows };
}
