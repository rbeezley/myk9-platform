// Authoritative data access module for the Club entity.
// All callers import from here — never from supabaseClient or replication
// tables directly, and never from the legacy queries/ files below.
//
// Implementations live in clubQueries.ts during migration and will
// move into reads.ts / writes.ts in follow-up PRs.

export {
  getAllClubs,
  getClubById,
  searchClubsByLocation,
  getActiveClubs,
  createClub,
  updateClub,
  deleteClub,
  hardDeleteClub,
  restoreClub,
  getDeletedClubs,
  searchClubs,
  getClubsWithShowCounts,
  getClubStatistics,
  checkClubNameExists,
} from './reads';
