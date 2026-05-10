// Authoritative data access module for the Wait List entity.
// All callers import from here — never from supabaseClient directly.

export type { WaitlistEntry, ClassWithWaitlistCount } from './reads';
export {
  getWaitlistByShow,
  getWaitlistByClass,
  getClassesWithWaitlistCounts,
  bulkPromoteWaitlistEntries,
  closeWaitlistForClasses,
  offerWaitlistSpot,
  promoteWaitlistEntry,
  removeFromWaitlist,
  getWaitlistPosition,
  joinWaitlist,
  acceptWaitlistOffer,
} from './reads';
