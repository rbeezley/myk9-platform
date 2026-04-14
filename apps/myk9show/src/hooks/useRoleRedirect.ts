/**
 * Hook for handling role-based redirects.
 * Automatically redirects users to the dashboard for their highest role on login.
 *
 * Priority: SITE_ADMIN > CLUB_ADMIN > SECRETARY > JUDGE > EXHIBITOR
 * See roleUtils.ts for the route lookup table.
 */

import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from './useAuthContext';
import { getDashboardRoute } from './roleUtils';

interface UseRoleRedirectOptions {
  enabled?: boolean;
  redirectOnRoleChange?: boolean;
}

export const useRoleRedirect = (options: UseRoleRedirectOptions = {}) => {
  const { enabled = true, redirectOnRoleChange = false } = options;
  const navigate = useNavigate();
  const { user, userWithRoles, loading, rbacLoading } = useAuthContext();

  const performRoleBasedRedirect = useCallback(() => {
    // Don't redirect if disabled, still loading, RBAC not yet loaded, or not authenticated
    if (!enabled || loading || rbacLoading || !user || !userWithRoles) return;

    const roles = userWithRoles?.roles ?? [];
    const destination = getDashboardRoute(roles);
    navigate(destination, { replace: true });
  }, [enabled, loading, rbacLoading, user, userWithRoles, navigate]);

  // Effect for initial auth state changes (login)
  useEffect(() => {
    if (!redirectOnRoleChange) {
      performRoleBasedRedirect();
    }
  }, [redirectOnRoleChange, performRoleBasedRedirect]);

  // Effect for role changes during active session
  // Track userWithRoles to detect role switches
  useEffect(() => {
    if (redirectOnRoleChange && user && userWithRoles) {
      performRoleBasedRedirect();
    }
  }, [redirectOnRoleChange, user, userWithRoles, performRoleBasedRedirect]);

  return {
    performRoleBasedRedirect,
  };
};

export default useRoleRedirect;
