/**
 * Hook for handling role-based redirects
 * Automatically redirects users to appropriate dashboards based on their roles
 */

import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from './useAuthContext';
import { UserRole } from '@/types/auth-types';

interface UseRoleRedirectOptions {
  enabled?: boolean;
  redirectOnRoleChange?: boolean;
}

export const useRoleRedirect = (options: UseRoleRedirectOptions = {}) => {
  const { enabled = true, redirectOnRoleChange = false } = options;
  const navigate = useNavigate();
  const { user, userWithRoles, hasRole, loading } = useAuthContext();

  const performRoleBasedRedirect = useCallback(() => {
    // Don't redirect if disabled, still loading, or not authenticated
    if (!enabled || loading || !user) return;

    // Redirect based on user role (priority order)
    if (hasRole(UserRole.SITE_ADMIN)) {
      // Site admins go to analytics/system overview
      navigate('/analytics', { replace: true });
    } else if (hasRole(UserRole.CLUB_ADMIN) || hasRole(UserRole.SECRETARY)) {
      // Club admins and secretaries go to their dashboard
      navigate('/secretary/dashboard', { replace: true });
    } else if (hasRole(UserRole.JUDGE)) {
      // Judges go to their dashboard (fallback to exhibitor dashboard until judge dashboard is built)
      navigate('/exhibitor/dashboard', { replace: true });
    } else if (hasRole(UserRole.EXHIBITOR)) {
      // Exhibitors go to their dashboard
      navigate('/exhibitor/dashboard', { replace: true });
    } else {
      // Default fallback for any other roles
      navigate('/exhibitor/dashboard', { replace: true });
    }
  }, [enabled, loading, user, hasRole, navigate]);

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
    performRoleBasedRedirect
  };
};

export default useRoleRedirect;