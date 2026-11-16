import type { ClassSpotState, WaitlistSpots } from './waitlistSpots';
import type { RunOutOfferEntry } from './runOutOffers';
import type { WaitingList } from './types';

/** Offers that ran out in one class. */
export interface RunOutInClass {
  classId: string;
  className: string;
  count: number;
}

/**
 * What the Waitlist list has waiting for a person: classes with a spot to offer, and offers that
 * ran out. `count` is the one number the Show Desk pill and the Actions menu row both show.
 */
export interface WaitlistWaiting {
  count: number;
  /** Classes with a spot open and a dog waiting. Empty while the judge-day figures are unknown. */
  spotClasses: ClassSpotState[];
  runOut: RunOutInClass[];
}

/**
 * Joins `findOpenWaitlistSpots` and `findRunOutOffers` into the waitlist's "waiting for you".
 * A spot is never counted while `spots.unknown` is set: that is "not known", and showing it as
 * a spot (or as none) would both be a guess. Run-out offers come from the replica alone, so
 * they still count.
 */
export function summarizeWaitlistWaiting(input: {
  spots: WaitlistSpots;
  runOut: WaitingList<RunOutOfferEntry>;
  classNameById: ReadonlyMap<string, string>;
}): WaitlistWaiting {
  const spotClasses = input.spots.unknown ? [] : input.spots.rows;
  const byClass = new Map<string, RunOutInClass>();
  for (const offer of input.runOut.rows) {
    const found = byClass.get(offer.classId);
    if (found) found.count += 1;
    else {
      byClass.set(offer.classId, {
        classId: offer.classId,
        className: input.classNameById.get(offer.classId) ?? 'a class',
        count: 1,
      });
    }
  }
  const runOut = [...byClass.values()];
  return { count: spotClasses.length + input.runOut.count, spotClasses, runOut };
}
