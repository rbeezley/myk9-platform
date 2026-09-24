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
  forceDeleteDog,
  searchDogs,
  searchAllDogs,
  SEARCH_ALL_DOGS_LIMIT,
  getDogStatistics,
  hardDeleteDog,
  restoreDog,
  getDeletedDogs,
  getOwnedLiveDogsByPerson,
} from './reads';
export type { OwnedLiveDog } from './reads';
export type { RestoreDogResult, SkippedPlacement } from './restoreDogResult';
