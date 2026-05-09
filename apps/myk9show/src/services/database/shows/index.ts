// Authoritative data access module for the Show entity.
// All callers import from here — never from supabaseClient or replication
// tables directly, and never from the legacy queries/ files below.
//
// Implementations live in reads.ts / writes.ts. The legacy
// services/database/queries/showQueries.ts file only re-exports this module.

export {
  getAllShows,
  getPublicShows,
  getShowById,
  getUpcomingShows,
  getShowsByDateRange,
  getShowsByClub,
  searchShows,
  getShowStatistics,
  getShowsWithEntryCounts,
  getShowsByStatus,
  getSecretaryShows,
} from './reads';

export {
  createShow,
  updateShow,
  deleteShow,
  hardDeleteShow,
  restoreShow,
  getDeletedShows,
} from './writes';
