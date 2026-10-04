// Authoritative data access module for the Wait List entity.
// All callers import from here — never from supabaseClient directly.

export type { WaitlistEntry, ClassWithWaitlistCount, WaitlistOfferMessageOutcome } from './reads';
export {
  getWaitlistByClass,
  getClassesWithWaitlistCounts,
  bulkPromoteWaitlistEntries,
  closeWaitlistForClasses,
  promoteWaitlistEntry,
  removeFromWaitlist,
  sendWaitlistOfferMessage,
} from './reads';
export { getWaitlistReportRows, WaitlistNotDownloadedError } from './reportRows';
