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
  fetchPersonIdentity,
  SIGN_IN_EMAIL_LOCKED_CODE,
  SIGN_IN_EMAIL_LOCKED_MESSAGE,
  SIGN_IN_EMAIL_UNVERIFIABLE_CODE,
  SIGN_IN_EMAIL_UNVERIFIABLE_MESSAGE,
} from './signInEmailGuard';
export type { SignInEmailChangeDecision, PersonIdentitySnapshot } from './signInEmailGuard';

export type { PersonUpdate } from './reads';
export {
  loadPersonPrivateDetails,
  savePersonPrivateDetails,
  hasPersonPrivatePatch,
} from './personPrivate';
export type { PersonPrivateDetails, PersonPrivatePatch } from './personPrivate';

export { decidePersonEmailLock, fetchPersonEmailLockFacts } from './personEmailLock';
export type { PersonEmailLock, PersonEmailLockFacts } from './personEmailLock';
