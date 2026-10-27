import { useEffect } from 'react';
import { clearAllRbacPermissionsCaches } from './rbacPermissionsCache';
import { clearAllPersonIdentityCaches } from './personIdentityCache';

/**
 * Drop the device-local copies that let a signed-in user paint before the
 * server answers (saved roles, people.id pairing). Called on every sign-out
 * path and when auth resolves with no user, so no copy crosses a sign-out
 * (MYK9-1349). Never call while auth is still unresolved: the offline cold
 * boot (MYK9-200) needs these.
 */
export function purgeSignedOutAccountCaches(): void {
  clearAllRbacPermissionsCaches();
  clearAllPersonIdentityCaches();
}

/**
 * Auth RESOLVED with no user: any saved roles/identity crossed a sign-out the
 * app never saw (session expired or revoked while it was closed). Not while
 * loading: the offline cold boot restores the session after this.
 */
export function useSignedOutCachePurge(authLoading: boolean, hasUser: boolean): void {
  const settledSignedOut = !authLoading && !hasUser;
  useEffect(() => {
    if (settledSignedOut) purgeSignedOutAccountCaches();
  }, [settledSignedOut]);
}
