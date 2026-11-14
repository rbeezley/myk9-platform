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
 * offered the freed spot; with nobody waiting there is nothing for the secretary to do and the
 * row would otherwise count forever.
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
  const rows: ExpiredOfferRow[] = [];
  for (const offer of input.waitlist) {
    if (!classesWithQueue.has(offer.classId)) continue;
    if (status(offer) === 'expired') {
      rows.push({ offer, classId: offer.classId, closed: true });
      continue;
    }
    if (status(offer) !== 'offered' || offer.joinedVia === 'mail_in') continue;
    const deadline = offer.offerExpiresAt ? Date.parse(offer.offerExpiresAt) : Number.NaN;
    if (Number.isFinite(deadline) && deadline <= input.now.getTime()) {
      rows.push({ offer, classId: offer.classId, closed: false });
    }
  }
  return { count: rows.length, rows };
}
