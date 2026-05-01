// Authoritative data access module for the Dog entity.
// All callers import from here — never from supabaseClient or replication
// tables directly, and never from the legacy queries/ files below.
//
// Implementations live in dogQueries.ts during migration and will
// move into reads.ts / writes.ts in follow-up PRs.

export {
  getAllDogs,
  getDogById,
  getDogsByOwner,
  createDog,
  updateDog,
  deleteDog,
  searchDogs,
  searchAllDogs,
  getDogsWithUpcomingShows,
  getDogStatistics,
  hardDeleteDog,
  restoreDog,
  getDeletedDogs,
} from '../queries/dogQueries';
