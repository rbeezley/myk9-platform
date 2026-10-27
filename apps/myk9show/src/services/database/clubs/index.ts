// Authoritative data access module for the Club entity.
// All callers import from here — never from supabaseClient or replication
// tables directly.

export {
  getAllClubs,
  getClubsAwaitingAuthorization,
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

export { setClubAuthorization } from './authorization';
export { getClubRegistryNumbers, saveClubRegistryNumbers } from './registryNumbers';
export {
  getPublicDirectoryClubs,
  getPublicClubById,
  PUBLIC_DIRECTORY_CLUB_COLUMNS,
  PUBLIC_CLUB_DETAIL_COLUMNS,
} from './publicDirectory';
