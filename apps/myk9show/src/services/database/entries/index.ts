// Authoritative data access module for the Entry entity.
// All callers import from here — never from supabaseClient or replication
// tables directly, and never from the legacy queries/ files below.
//
// Implementations live in the sibling query files during migration and will
// move into reads.ts / writes.ts / search.ts in follow-up PRs.

export * from './reads';
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
} from './writes';
export * from './search';
export * from './secretary';
export { hardDeleteEntry, restoreEntry, getDeletedEntries } from '../queries/classQueries.entries';
