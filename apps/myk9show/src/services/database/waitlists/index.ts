// Authoritative data access module for the Wait List entity.
// All callers import from here — never from supabaseClient directly.

export type {
  WaitlistEntry,
  WaitlistOffer,
  ClassWithWaitlistCount,
  WaitlistOfferMessageOutcome,
} from './reads';
export {
  getWaitlistByClass,
  getWaitlistOffersByClass,
  getClassesWithWaitlistCounts,
  bulkPromoteWaitlistEntries,
  closeWaitlistForClasses,
  promoteWaitlistEntry,
  removeFromWaitlist,
  sendWaitlistOfferMessage,
} from './reads';
export {
  withdrawWaitlistOffer,
  WaitlistOfferNotWithdrawnError,
  WITHDRAW_OFFER_FAILED_MESSAGE,
  type WithdrawOfferOutcome,
} from './offerActions';
export { getWaitlistReportRows, WaitlistNotDownloadedError } from './reportRows';
