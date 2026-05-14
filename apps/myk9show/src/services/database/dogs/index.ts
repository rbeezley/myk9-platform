// Authoritative data access module for the Dog entity.
// All callers import from here — never from supabaseClient or replication
// tables directly.

export {
  getAllDogs,
  getDogById,
  getDogsByOwner,
  createDog,
  updateDog,
  deleteDog,
  searchDogs,
  searchAllDogs,
  SEARCH_ALL_DOGS_LIMIT,
  getDogsWithUpcomingShows,
  getDogStatistics,
  hardDeleteDog,
  restoreDog,
  getDeletedDogs,
} from './reads';
