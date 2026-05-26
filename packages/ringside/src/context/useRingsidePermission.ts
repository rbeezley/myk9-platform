import type { UserPermissions, UserRole } from '../auth/passcodes';
import { useRingsideAuth } from './RingsideContext';

/**
 * Permission-check hook derived from `useRingsideAuth()`.
 *
 * Mirrors the surface of `apps/myk9q/src/hooks/usePermission.ts` so
 * pages moving into the package don't need to relearn an API. The
 * single source of truth is still the host — this hook just reshapes
 * `auth.role` + `auth.canAccess` into the call-site-friendly form
 * existing call sites use.
 *
 * Note: this is one of the rare cases where a "derived" hook in the
 * package is justified. The host's `usePermission` reads from the host's
 * AuthContext directly; ringside's reads from RingsideContext. Two
 * implementations, one surface — the alternative (host injects the
 * whole permission hook) would force every host to provide the same
 * boilerplate.
 */
export function useRingsidePermission() {
  const { role, canAccess } = useRingsideAuth();

  const hasPermission = (permission: keyof UserPermissions): boolean => {
    return canAccess(permission);
  };

  const hasRole = (allowedRoles: UserRole | UserRole[]): boolean => {
    if (!role) return false;
    if (Array.isArray(allowedRoles)) {
      return allowedRoles.includes(role);
    }
    return role === allowedRoles;
  };

  const isAdmin = (): boolean => role === 'admin';
  const isJudge = (): boolean => role === 'judge';
  const isSteward = (): boolean => role === 'steward';
  const isExhibitor = (): boolean => role === 'exhibitor';

  return {
    hasPermission,
    hasRole,
    isAdmin,
    isJudge,
    isSteward,
    isExhibitor,
    currentRole: role,
  };
}
