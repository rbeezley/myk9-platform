/**
 * Enhanced Auth Hooks
 * Separated from context for better Fast Refresh support
 */

import { useContext } from 'react';
import { EnhancedAuthContext, EnhancedAuthContextType } from '@/context/EnhancedAuthContext';

/**
 * Hook to use the enhanced auth context
 */
export function useEnhancedAuth(): EnhancedAuthContextType {
  const context = useContext(EnhancedAuthContext);
  if (context === undefined) {
    throw new Error('useEnhancedAuth must be used within an EnhancedAuthProvider');
  }
  return context;
}

/**
 * Migration hook for gradually moving from old to new auth system
 */
export function useMigratedAuth() {
  const context = useEnhancedAuth();
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