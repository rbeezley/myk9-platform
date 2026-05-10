// Authoritative data access module for the User entity.
// All callers import from here — never from supabaseClient or replication
// tables directly, and never from the legacy queries/ files below.
//
// Implementations live in userQueries.ts during migration and will
// move into reads.ts / writes.ts in follow-up PRs.

export {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  hardDeleteUser,
  permanentDeleteUser,
  restoreUser,
  getDeletedUsers,
  searchUsers,
  getUsersByRole,
  getUsersWithDogCounts,
  getUsersStatistics,
  checkEmailExists,
} from './reads';
