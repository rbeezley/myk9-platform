import type { AuthContextType } from '@/context/authContextTypes';

const needsFullApp = (): Promise<never> =>
  Promise.reject(new Error('Sign-in is not available until the app has loaded.'));

/**
 * What the auth context reads as for a visitor with no session (MYK9-2140): nobody signed in,
 * nothing loading, no roles. The landing page only reads `user`. The sign-in actions live on
 * the sign-in pages, which the full app serves, so here they refuse rather than pretend.
 */
export const GUEST_AUTH_VALUE: AuthContextType = {
  user: null,
  userWithRoles: null,
  loading: false,
  signIn: needsFullApp,
  signUp: needsFullApp,
  resendConfirmationEmail: needsFullApp,
  signOut: () => Promise.resolve(),
  signInWithGoogle: needsFullApp,
  signInWithApple: needsFullApp,
  resetPassword: needsFullApp,
  updatePassword: needsFullApp,
  updateProfile: needsFullApp,
  hasRole: () => false,
  hasPermission: () => false,
  getUserRoles: () => [],
  switchUserRole: () => undefined,
  checkPermissionAsync: () => Promise.resolve(false),
  isAdmin: false,
  isSecretary: false,
  isExhibitor: false,
  isJudge: false,
  dbPermissions: [],
  dbRoles: [],
  rbacUserRoles: [],
  rbacScopedPermissions: [],
  rbacLoading: false,
  rbacError: null,
  rbacLastRefreshed: null,
  rbacFromCacheAt: null,
  refreshPermissions: () => Promise.resolve(),
  firstName: null,
  lastName: null,
};
