/**
 * Enhanced Auth Hooks
 *
 * DEPRECATED: This hook is now an alias for useAuthContext.
 * The AuthContext has been consolidated to include all enhanced features.
 *
 * For new code, prefer using useAuthContext directly.
 */

import { useAuthContext } from '@/hooks/useAuthContext';
import { AuthContextType } from '@/context/AuthContext';

// Re-export the type for backwards compatibility
export type EnhancedAuthContextType = AuthContextType;

/**
 * @deprecated Use useAuthContext instead - AuthContext now includes all enhanced features
 */
export function useEnhancedAuth(): AuthContextType {
  return useAuthContext();
}

/**
 * Migration hook for gradually moving from old to new auth system
 */
export function useMigratedAuth() {
  const context = useAuthContext();
  const isMigrated = context.dbRoles.length > 0;

  return {
    isMigrated,
    isLoading: context.rbacLoading,
    error: context.rbacError,
    migrationStatus: context.rbacError ? 'error' : (isMigrated ? 'completed' : 'pending') as 'pending' | 'in_progress' | 'completed' | 'failed' | 'error',
    useDatabase: isMigrated,
    isLegacy: !isMigrated
  };
}
