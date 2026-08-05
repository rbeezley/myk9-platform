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
  getDeletedUserById,
  searchUsers,
  getUsersByRole,
  getUsersWithDogCounts,
  getUsersStatistics,
  checkEmailExists,
} from './reads';

export {
  decideSignInEmailChange,
  checkSignInEmailChange,
  SIGN_IN_EMAIL_LOCKED_CODE,
  SIGN_IN_EMAIL_LOCKED_MESSAGE,
  SIGN_IN_EMAIL_UNVERIFIABLE_CODE,
  SIGN_IN_EMAIL_UNVERIFIABLE_MESSAGE,
} from './signInEmailGuard';
export type { SignInEmailChangeDecision, PersonIdentitySnapshot } from './signInEmailGuard';
