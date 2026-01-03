import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { UserRole, UserPermissions, getPermissionsForRole } from '../utils/auth';
import { initializeReplication, clearReplicationCaches, resetReplicationState } from '@/services/replication/initReplication';
import { destroyReplicationManager } from '@/services/replication';
import { useOfflineQueueStore } from '@/stores/offlineQueueStore';
import { prefetchCriticalChunks, resetPrefetchState } from '@/utils/chunkPrefetch';
import { logger } from '@/utils/logger';
import { setSupabaseLicenseKey } from '@/lib/supabase';

interface ShowContext {
  showId: string;
  showName: string;
  clubName: string;
  showDate: string;
  licenseKey: string;
  org: string; // Organization type (e.g., 'UKC Obedience', 'AKC Scent Work')
  competition_type: string; // Competition type (e.g., 'National', 'Regular')
  showType?: string; // Show type for nationals detection
}

interface AuthState {
  isAuthenticated: boolean;
  role: UserRole | null;
  permissions: UserPermissions | null;
  showContext: ShowContext | null;
  // NOTE: passcode intentionally NOT stored - security risk (XSS could steal credentials)
  // We only need role/permissions after login, not the original passcode
}

export interface LogoutResult {
  success: boolean;
  blocked?: boolean;
  message?: string;
  pendingCount?: number;
  failedCount?: number;
}

interface AuthContextType extends AuthState {
  login: (passcode: string, showData: ShowContext) => void;
  logout: () => Promise<LogoutResult>;
  canAccess: (permission: keyof UserPermissions) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

const loadAuthFromStorage = (): AuthState => {
  try {
    const stored = localStorage.getItem('myK9Q_auth');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    logger.error('Error loading auth from storage:', error);
  }
  
  return {
    isAuthenticated: false,
    role: null,
    permissions: null,
    showContext: null,
  };
};

const saveAuthToStorage = (authState: AuthState) => {
  try {
    localStorage.setItem('myK9Q_auth', JSON.stringify(authState));
  } catch (error) {
    logger.error('Error saving auth to storage:', error);
  }
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>(loadAuthFromStorage);

  // Set license key for RLS on initial load (restored session)
  useEffect(() => {
    if (authState.showContext?.licenseKey) {
      setSupabaseLicenseKey(authState.showContext.licenseKey);
      logger.log('[Auth] 🔐 Restored license key for RLS filtering');
    }
  }, []); // Only run once on mount

  const login = useCallback(async (passcode: string, showData: ShowContext) => {
    // CRITICAL: Clear caches on EVERY login to ensure fresh data
    // This handles:
    // 1. Show switch (different license key)
    // 2. Re-login after logout (previousLicenseKey is null but cache may be stale)
    // 3. Re-login to same show (cache may be stale from previous session)
    const previousLicenseKey = authState.showContext?.licenseKey;
    const newLicenseKey = showData.licenseKey;
    const isShowSwitch = previousLicenseKey && previousLicenseKey !== newLicenseKey;
    const isFreshLogin = !previousLicenseKey; // No previous session (logged out or first login)

    logger.log(`[Auth] 🔐 Login: previous=${previousLicenseKey || 'none'}, new=${newLicenseKey}, isShowSwitch=${isShowSwitch}, isFreshLogin=${isFreshLogin}`);

    // CRITICAL: Check for pending offline scores before clearing caches
    // Losing offline scores would be a catastrophic data loss
    const pendingCount = useOfflineQueueStore.getState().getPendingCount();
    const failedCount = useOfflineQueueStore.getState().getFailedCount();

    if (pendingCount > 0 || failedCount > 0) {
      // DO NOT clear caches if there are pending offline scores
      // The old show's data will remain in cache, but that's better than losing scores
      logger.error(
        `[Auth] ⛔ BLOCKING cache clear - ${pendingCount} pending + ${failedCount} failed offline scores would be lost!`
      );
      logger.log(
        `[Auth] ⚠️ Proceeding with login but keeping old cache. User should sync scores first.`
      );
      // Don't clear caches - proceed with login but leave old data in place
      // The license_key filter in useHomeDashboardData will prevent cross-show data display
    } else {
      // Safe to clear caches - no pending offline scores
      // Clear on EVERY login to ensure fresh data (cache will be repopulated by initializeReplication)
      logger.log(`[Auth] ✅ No pending offline scores, clearing caches for fresh start...`);
      try {
        // Clear React Query persisted cache from localStorage
        localStorage.removeItem('myK9Q-react-query-cache');
        logger.log('[Auth] ✅ React Query cache cleared');

        // Clear IndexedDB replication caches
        await clearReplicationCaches();
        logger.log('[Auth] ✅ IndexedDB replication caches cleared');

        // CRITICAL: Destroy the old ReplicationManager instance
        // This ensures new login creates a fresh manager with the new license key
        destroyReplicationManager();
        logger.log('[Auth] ✅ ReplicationManager destroyed');

        // Reset replication state so it can reinitialize with new license key
        resetReplicationState();
        logger.log('[Auth] ✅ Replication state reset');
      } catch (error) {
        logger.error('[Auth] ⚠️ Error clearing caches on login:', error);
        // Continue with login even if cache clearing fails
      }
    }

    // Parse role from passcode (first character)
    const rolePrefix = passcode.charAt(0).toLowerCase();
    let role: UserRole;

    switch (rolePrefix) {
      case 'a':
        role = 'admin';
        break;
      case 'j':
        role = 'judge';
        break;
      case 's':
        role = 'steward';
        break;
      case 'e':
        role = 'exhibitor';
        break;
      default:
        throw new Error('Invalid passcode');
    }

    const permissions = getPermissionsForRole(role);

    const newAuthState = {
      isAuthenticated: true,
      role,
      permissions,
      showContext: showData,
    };

    setAuthState(newAuthState);
    saveAuthToStorage(newAuthState);

    // Set license key for server-side RLS filtering
    setSupabaseLicenseKey(showData.licenseKey);

    // Initialize replication after login
    // Previously skipped at app startup due to missing license key
    // Now that license key is available, trigger initialization and sync
    try {
      await initializeReplication();
      logger.log('[Auth] ✅ Replication initialized after login');
    } catch (error) {
      logger.error('[Auth] ❌ Failed to initialize replication after login:', error);
      // Don't throw - app should work without replication
    }

    // CRITICAL: Prefetch all lazy-loaded chunks for offline availability
    // Judges log in at check-in (online) then walk to exterior search areas (offline)
    // Without this, ClassList/EntryList chunks won't be available offline
    prefetchCriticalChunks().catch(error => {
      logger.warn('[Auth] ⚠️ Chunk prefetch failed (non-fatal):', error);
    });
  }, [authState.showContext?.licenseKey]);

  const logout = useCallback(async (): Promise<LogoutResult> => {
    logger.log('[Auth] Attempting logout...');

    // CRITICAL: Check for pending offline scores - block logout to prevent data loss
    const pendingCount = useOfflineQueueStore.getState().getPendingCount();
    const failedCount = useOfflineQueueStore.getState().getFailedCount();
    const totalUnsynced = pendingCount + failedCount;

    if (totalUnsynced > 0) {
      const message = `You have ${totalUnsynced} unsynced score${totalUnsynced > 1 ? 's' : ''}. ` +
        `Please sync your scores before logging out to avoid data loss.`;

      logger.warn(`[Auth] ⛔ BLOCKING logout - ${pendingCount} pending + ${failedCount} failed offline scores`);

      return {
        success: false,
        blocked: true,
        message,
        pendingCount,
        failedCount,
      };
    }

    // Safe to proceed with logout
    const newAuthState = {
      isAuthenticated: false,
      role: null,
      permissions: null,
      showContext: null,
    };

    setAuthState(newAuthState);
    localStorage.removeItem('myK9Q_auth');
    sessionStorage.removeItem('auth');

    // Clear license key for RLS (no longer authenticated)
    setSupabaseLicenseKey(null);

    // Clear all caches
    try {
      // Clear React Query persisted cache from localStorage
      localStorage.removeItem('myK9Q-react-query-cache');
      logger.log('[Auth] ✅ React Query cache cleared');

      // Safe to clear all caches including offline queue (no pending scores)
      await clearReplicationCaches();
      logger.log('[Auth] ✅ IndexedDB replication caches cleared');

      // CRITICAL: Destroy the old ReplicationManager instance
      // This ensures next login creates a fresh manager with the new license key
      destroyReplicationManager();
      logger.log('[Auth] ✅ ReplicationManager destroyed');

      // Reset replication state so it can reinitialize with new license key
      resetReplicationState();
      logger.log('[Auth] ✅ Replication state reset');

      // Reset chunk prefetch state so it re-prefetches on next login
      resetPrefetchState();
      logger.log('[Auth] ✅ Chunk prefetch state reset');
    } catch (error) {
      logger.error('[Auth] ⚠️ Error clearing caches on logout:', error);
      // Continue with logout even if cache clearing fails
    }

    logger.log('[Auth] ✅ Logout complete');
    return { success: true };
  }, []);

  const canAccess = useCallback((permission: keyof UserPermissions): boolean => {
    if (!authState.permissions) return false;
    return authState.permissions[permission];
  }, [authState.permissions]);


  // Memoize context value to prevent infinite re-render loops
  // Without this, a new object is created every render, causing all consumers
  // to re-render, which can trigger state updates that cause more renders
  const contextValue = useMemo(
    () => ({
      ...authState,
      login,
      logout,
      canAccess,
    }),
    [authState, login, logout, canAccess]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};