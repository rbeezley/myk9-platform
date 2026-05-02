// Authoritative data access module for the Show entity.
// All callers import from here — never from supabaseClient or replication
// tables directly, and never from the legacy queries/ files below.
//
// Implementations live in showQueries.ts during migration and will
// move into reads.ts / writes.ts in follow-up PRs.

export {
  getAllShows,
  getShowById,
  getUpcomingShows,
  getShowsByDateRange,
  getShowsByClub,
  searchShows,
  getShowStatistics,
  getShowsWithEntryCounts,
  getShowsByStatus,
  getSecretaryShows,
  createShow,
  updateShow,
  deleteShow,
  hardDeleteShow,
  restoreShow,
  getDeletedShows,
} from './reads';
