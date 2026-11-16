import type { RunOutOfferEntry } from './runOutOffers';
import type { WaitingList } from './types';
import type { WaitlistSpots } from './waitlistSpots';

/** Offers that ran out in one class. */
export interface RunOutInClass {
  classId: string;
  className: string;
  count: number;
}

/** A class with a spot to offer, and the dog next in line for it (null until its name is read). */
export interface OpenSpotInClass {
  classId: string;
  className: string;
  nextDogName: string | null;
}

/**
 * What the Waitlist list has waiting for a person: offers that ran out (the run-out notice) and
 * classes with a spot to offer (the page's "spot open" line). `count` is the one number the Show
 * Desk pill and the Actions menu row show: the run-out offers plus one per class with a spot.
 * `openSpots` is empty when the show offers spots automatically or the judge-day figures are not
 * known.
 */
export interface WaitlistWaiting {
  count: number;
  runOut: RunOutInClass[];
  openSpots: OpenSpotInClass[];
}

/**
 * Groups `findRunOutOffers`' rows by class and adds the classes `findOpenWaitlistSpots` found
 * open, so `count` equals what the Waitlist page shows as needing her.
 */
export function summarizeWaitlistWaiting(input: {
  runOut: WaitingList<RunOutOfferEntry>;
  classNameById: ReadonlyMap<string, string>;
  /** `findOpenWaitlistSpots`' answer; null while the judge-day figures are not loaded. */
  spots?: WaitlistSpots | null;
  /** The show's automatic offering is off, so an open spot waits for a person. */
  spotsWaitForAPerson?: boolean;
  dogNameById?: ReadonlyMap<string, string> | undefined;
}): WaitlistWaiting {
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
  const { spots } = input;
  const openSpots: OpenSpotInClass[] =
    input.spotsWaitForAPerson && spots && !spots.unknown
      ? spots.rows.map(row => ({
          classId: row.classId,
          className: row.className,
          nextDogName: row.nextInLine
            ? (input.dogNameById?.get(row.nextInLine.dogId) ?? null)
            : null,
        }))
      : [];
  return {
    count: input.runOut.count + openSpots.length,
    runOut: [...byClass.values()],
    openSpots,
  };
}
