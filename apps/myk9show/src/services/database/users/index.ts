// Authoritative data access module for the User entity.
// All callers import from here — never from supabaseClient or replication
// tables directly.

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
