/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Authentication Helper Utilities
 * Provides centralized auth context access and fallback mechanisms
 */

import { useContext } from 'react';
import { AuthContext } from '@/context/AuthContext';
import { logger } from '@/services/LoggingService';

/**
 * Get current user ID with fallback
 */
export function getCurrentUserId(): string {
  try {
    // In a React component context, this would use useContext
    // For store usage, we need a different approach
    const storedUser = localStorage.getItem('dev-current-mock-user');
    if (storedUser) {
      return storedUser;
    }
    
    // Fallback to a default system user ID
    return 'system-user';
  } catch (error) {
    logger.error('Failed to get current user ID', 'authHelpers', { error });
    return 'system-user';
  }
}

/**
 * Get current user info with fallback
 */
export function getCurrentUserInfo(): { id: string; email: string; name: string } {
  try {
    const userId = getCurrentUserId();
    
    // In a real implementation, this would fetch from auth context
    // For now, provide sensible defaults based on the stored user
    const userMappings: Record<string, { email: string; name: string }> = {
      'admin-user': { email: 'admin@example.com', name: 'Admin User' },
      'secretary-user': { email: 'secretary@example.com', name: 'Secretary User' },
      'exhibitor-user': { email: 'exhibitor@example.com', name: 'Exhibitor User' },
      'judge-user': { email: 'judge@example.com', name: 'Judge User' },
      'system-user': { email: 'system@example.com', name: 'System User' }
    };
    
    const userInfo = userMappings[userId] || userMappings['system-user'];
    
    return {
      id: userId,
      ...userInfo
    };
  } catch (error) {
    logger.error('Failed to get current user info', 'authHelpers', { error });
    return {
      id: 'system-user',
      email: 'system@example.com',
      name: 'System User'
    };
  }
}

/**
 * Hook to get current auth context (for React components)
 */
export function useCurrentUser() {
  const context = useContext(AuthContext);
  
  if (!context) {
    logger.warn('useCurrentUser called outside of AuthContext', 'authHelpers');
    return getCurrentUserInfo();
  }
  
  return {
    id: context.user?.id || getCurrentUserId(),
    email: context.user?.email || 'unknown@example.com',
    name: (context.user as any)?.name || 'Unknown User'
  };
}

/**
 * Store-safe method to get last modified by info
 */
export function getLastModifiedBy(): string {
  const userInfo = getCurrentUserInfo();
  return userInfo.email;
}

/**
 * Get current authenticated user's UUID for database audit fields
 * Returns null for unauthenticated operations or directory-only users
 */
export async function getCurrentUserUUID(): Promise<string | null> {
  try {
    // Import supabase client
    const { supabase } = await import('@/lib/supabase');
    
    // Get current user from Supabase auth
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      logger.warn('Error getting current user UUID:', 'utils', {}, error as Error);
      return null;
    }
    
    return user?.id || null;
  } catch (error) {
    logger.warn('Failed to get current user UUID:', 'utils', {}, error as Error);
    return null;
  }
}

/**
 * Audit trail helper for store operations
 */
export interface AuditInfo {
  createdBy: string;
  createdAt: string;
  lastModifiedBy: string;
  lastModifiedAt: string;
}

export function createAuditInfo(): AuditInfo {
  const userInfo = getCurrentUserInfo();
  const timestamp = new Date().toISOString();
  
  return {
    createdBy: userInfo.email,
    createdAt: timestamp,
    lastModifiedBy: userInfo.email,
    lastModifiedAt: timestamp
  };
}

export function updateAuditInfo(existing: Partial<AuditInfo>): AuditInfo {
  const userInfo = getCurrentUserInfo();
  const timestamp = new Date().toISOString();
  
  return {
    createdBy: existing.createdBy || userInfo.email,
    createdAt: existing.createdAt || timestamp,
    lastModifiedBy: userInfo.email,
    lastModifiedAt: timestamp
  };
}

/**
 * Check if current user has permission (placeholder for RBAC integration)
 */
export function hasPermission(permission: string): boolean {
  try {
    const userInfo = getCurrentUserInfo();
    
    // Basic permission check based on user type
    // This should be replaced with proper RBAC when available
    const adminUsers = ['admin-user', 'system-user'];
    const secretaryUsers = ['secretary-user', 'admin-user', 'system-user'];
    
    switch (permission) {
      case 'admin':
        return adminUsers.includes(userInfo.id);
      case 'secretary':
        return secretaryUsers.includes(userInfo.id);
      case 'edit':
        return !userInfo.id.startsWith('guest-');
      default:
        return true; // Default to allowing access
    }
  } catch (error) {
    logger.error('Failed to check permission', 'authHelpers', { permission, error });
    return false; // Fail closed
  }
}

/**
 * Migrate existing hardcoded auth values to use auth context
 */
export function migrateAuthPlaceholders() {
  logger.info('Starting auth placeholder migration', 'authHelpers');
  
  // This function can be called during app initialization
  // to update any stored data that uses placeholder auth values
  
  const placeholderValues = [
    'current-user',
    'admin@example.com',
    'Current Judge'
  ];
  
  placeholderValues.forEach(placeholder => {
    logger.debug('Would migrate placeholder', 'authHelpers', { placeholder });
    // Actual migration logic would go here
  });
}