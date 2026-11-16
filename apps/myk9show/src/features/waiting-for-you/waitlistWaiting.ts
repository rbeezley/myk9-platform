import type { RunOutOfferEntry } from './runOutOffers';
import type { WaitingList } from './types';

/** Offers that ran out in one class. */
export interface RunOutInClass {
  classId: string;
  className: string;
  count: number;
}

/**
 * What the Waitlist list has waiting for a person: offers that ran out (the Waitlist page's
 * run-out notice). `count` is the one number the Show Desk pill and the Actions menu row show.
 * Phase 3 adds the classes with a spot to offer, beside `runOut`, with the page change.
 */
export interface WaitlistWaiting {
  count: number;
  runOut: RunOutInClass[];
}

/** Groups `findRunOutOffers`' rows by class; `count` is its count, so it equals the list's rows. */
export function summarizeWaitlistWaiting(input: {
  runOut: WaitingList<RunOutOfferEntry>;
  classNameById: ReadonlyMap<string, string>;
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
  return { count: input.runOut.count, runOut: [...byClass.values()] };
}
