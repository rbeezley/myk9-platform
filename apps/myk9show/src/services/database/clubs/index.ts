// Authoritative data access module for the Club entity.
// All callers import from here — never from supabaseClient or replication
// tables directly.

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
