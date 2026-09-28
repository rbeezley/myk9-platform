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
  countUpcomingClubShows,
  getClubStatistics,
  checkClubNameExists,
} from './reads';

export {
  getPendingClubAuthorizations,
  PENDING_CLUB_AUTHORIZATIONS_QUERY_KEY,
  setClubAuthorization,
} from './authorization';
export type { PendingClubAuthorization } from './authorization';
export {
  getPublicDirectoryClubs,
  getPublicClubById,
  PUBLIC_DIRECTORY_CLUB_COLUMNS,
  PUBLIC_CLUB_DETAIL_COLUMNS,
} from './publicDirectory';
