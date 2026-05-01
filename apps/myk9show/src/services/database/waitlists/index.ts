// Authoritative data access module for the Wait List entity.
// All callers import from here — never from supabaseClient directly.

export type { WaitlistEntry, ClassWithWaitlistCount } from '../queries/waitlistQueries';
export {
  getWaitlistByShow,
  getWaitlistByClass,
  getClassesWithWaitlistCounts,
  offerWaitlistSpot,
  removeFromWaitlist,
  getWaitlistPosition,
  joinWaitlist,
  acceptWaitlistOffer,
} from '../queries/waitlistQueries';
