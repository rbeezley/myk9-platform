// Authoritative data access module for the Entry entity.
// All callers import from here — never from supabaseClient or replication
// tables directly, and never from the legacy queries/ files below.
//
// Implementations live in the sibling query files during migration and will
// move into reads.ts / writes.ts / search.ts in follow-up PRs.

export * from '../queries/entry-query-lookups';
// updateEntryStatus is exported from secretaryEntryQueries (secretary signature);
// the mutations version uses a different params shape and has no production callers.
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
// hardDeleteEntry / restoreEntry / getDeletedEntries originate here for now;
// classQueries.entries.ts will be deleted once classQueries.ts is cleaned up.
export { hardDeleteEntry, restoreEntry, getDeletedEntries } from '../queries/classQueries.entries';
