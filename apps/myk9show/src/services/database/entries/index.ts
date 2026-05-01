// Authoritative data access module for the Entry entity.
// All callers import from here — never from supabaseClient or replication
// tables directly, and never from the legacy queries/ files below.
//
// Implementations live in the sibling query files during migration and will
// move into reads.ts / writes.ts / search.ts in follow-up PRs.

export * from '../queries/entry-query-lookups';
// updateEntryStatus excluded — conflicts with the secretary-signature version in secretaryEntryQueries.
export {
  applyPromoCodeToEntry,
  compEntry,
  createEntry,
  createMultipleEntries,
  deleteEntry,
  submitShowEntries,
  uncompEntry,
  updateEntry,
  updateEntryDetails,
  updateEntryHandler,
  withdrawEntry,
} from '../queries/entry-query-mutations';
export * from '../queries/entry-query-search';
export * from '../queries/secretaryEntryQueries';
export { hardDeleteEntry, restoreEntry, getDeletedEntries } from '../queries/classQueries.entries';
