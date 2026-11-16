import type { WaitlistSpotClass } from './waitlistSpots';

/** The class facts `findOpenWaitlistSpots` reads, from a `ClassWithWaitlistCount`. */
export function toSpotClass(cls: {
  id: string;
  name: string;
  trial_id: string;
  max_entries: number | null;
  /** Entries holding a seat (`countSeatHoldingEntries`). */
  accepted_count: number;
}): WaitlistSpotClass {
  return {
    id: cls.id,
    name: cls.name,
    trialId: cls.trial_id,
    maxEntries: cls.max_entries,
    seatHoldingCount: cls.accepted_count,
  };
}
