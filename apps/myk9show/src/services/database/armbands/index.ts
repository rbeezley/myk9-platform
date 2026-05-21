// Authoritative data access module for the Armband entity.
// All callers import from here — never from supabaseClient or replication
// tables directly, and never from `./reads` or `./secretary` sub-paths.
//
// Two distinct armband-assignment operations live here:
//   - claimNextArmband(showId, dogId) — RPC picks the next available number
//   - setEntryArmband(entryId, armband) — caller specifies the number
// They have different signatures and semantics; they are not interchangeable.

export {
  getArmbandCountForShow,
  claimNextArmband,
  lookupDogByArmband,
} from './reads';

export {
  setEntryArmband,
  autoAssignArmbands,
  getNextArmbandForShow,
  getEntryArmbandById,
} from './secretary';
