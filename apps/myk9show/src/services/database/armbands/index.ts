// Authoritative data access module for the Armband entity.
// All callers import from here — never from supabaseClient or replication
// tables directly, and never from the legacy queries/ files below.
//
// Implementations live in armbandQueries.ts during migration and will
// move into reads.ts / writes.ts in follow-up PRs.

export {
  getArmbandCountForShow,
  assignArmband,
  lookupDogByArmband,
} from './reads';
// assignArmband excluded from secretaryArmbandQueries — conflicts with the
// armbandQueries version already exported above (same signature, different impl).
export {
  autoAssignArmbands,
  getNextArmbandForShow,
  getEntryArmbandById,
} from './secretary';
