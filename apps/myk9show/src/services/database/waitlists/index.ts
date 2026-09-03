// Authoritative data access module for the Wait List entity.
// All callers import from here — never from supabaseClient directly.

export type { WaitlistEntry, ClassWithWaitlistCount } from './reads';
export {
  getWaitlistByClass,
  getClassesWithWaitlistCounts,
  bulkPromoteWaitlistEntries,
  closeWaitlistForClasses,
  getWaitlistOfferMessageTarget,
  promoteWaitlistEntry,
  removeFromWaitlist,
} from './reads';
