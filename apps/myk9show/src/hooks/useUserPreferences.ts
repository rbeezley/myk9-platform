/**
 * User Preferences Hook
 * Phase 6.4: User Preferences & UI State
 * 
 * React hook for managing user preferences with real-time synchronization
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { userPreferencesService } from '@/services/preferences/userPreferencesService';
import { reportInfo, reportStoreError } from '@/utils/standardizedErrorHandler';
import type {
  UserPreferences,
  PreferencesUpdate,
  DeviceInfo,
  SyncState,
  UseUserPreferencesReturn,
} from '@/types/user-preferences';

export function useUserPreferences(userId: string | null): UseUserPreferencesReturn {
  // State
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>(userPreferencesService.getSyncState());
  const [devices, setDevices] = useState<DeviceInfo[]>([]);

  // Refs
  const currentUserIdRef = useRef<string | null>(null);
  const isInitializedRef = useRef(false);

  /**
   * Load user preferences
   */
  const loadPreferences = useCallback(async (uid: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const prefs = await userPreferencesService.loadPreferences(uid);
      setPreferences(prefs);
      
      // Register device
      await userPreferencesService.registerDevice(uid);
      
      // Load devices
      const deviceList = await userPreferencesService.getDevices(uid);
      setDevices(deviceList);
      
      reportInfo('useUserPreferences', 'Preferences loaded successfully', { userId: uid });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load preferences';
      setError(errorMessage);
      reportStoreError('loadPreferences', 'userPreferences', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Update preferences
   */
  const updatePreferences = useCallback(async (updates: PreferencesUpdate) => {
    if (!userId) {
      throw new Error('No user ID provided');
    }

    try {
      setError(null);
      
      const updated = await userPreferencesService.updatePreferences(userId, updates);
      setPreferences(updated);
      
      reportInfo('useUserPreferences', 'Preferences updated successfully', { updates });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update preferences';
      setError(errorMessage);
      reportStoreError('updatePreferences', 'userPreferences', err);
      throw err;
    }
  }, [userId]);

  /**
   * Reset preferences to defaults
   */
  const resetToDefaults = useCallback(async (category?: keyof PreferencesUpdate) => {
    if (!userId) {
      throw new Error('No user ID provided');
    }

    try {
      setError(null);
      
      const reset = await userPreferencesService.resetToDefaults(userId, category);
      setPreferences(reset);
      
      reportInfo('useUserPreferences', 'Preferences reset to defaults', { category });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to reset preferences';
      setError(errorMessage);
      reportStoreError('resetPreferences', 'userPreferences', err);
      throw err;
    }
  }, [userId]);

  /**
   * Export preferences
   */
  const exportPreferences = useCallback(async (): Promise<string> => {
    if (!userId) {
      throw new Error('No user ID provided');
    }

    try {
      const exported = await userPreferencesService.exportPreferences(userId);
      reportInfo('useUserPreferences', 'Preferences exported successfully');
      return exported;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to export preferences';
      setError(errorMessage);
      reportStoreError('exportPreferences', 'userPreferences', err);
      throw err;
    }
  }, [userId]);

  /**
   * Import preferences
   */
  const importPreferences = useCallback(async (data: string) => {
    if (!userId) {
      throw new Error('No user ID provided');
    }

    try {
      setError(null);
      
      const imported = await userPreferencesService.importPreferences(userId, data);
      setPreferences(imported);
      
      reportInfo('useUserPreferences', 'Preferences imported successfully');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to import preferences';
      setError(errorMessage);
      reportStoreError('importPreferences', 'userPreferences', err);
      throw err;
    }
  }, [userId]);

  /**
   * Resolve sync conflicts
   */
  const resolveConflicts = useCallback(async (resolution: 'local' | 'remote' | 'merge') => {
    if (!userId) {
      throw new Error('No user ID provided');
    }

    try {
      setError(null);

      switch (resolution) {
        case 'remote': {
          const remotePrefs = await userPreferencesService.forceSync(userId);
          setPreferences(remotePrefs);
          break;
        }
        case 'local': {
          if (preferences) {
            const updated = await userPreferencesService.updatePreferences(userId, {
              theme: preferences.theme,
              competition: preferences.competition,
              notifications: preferences.notifications,
              data: preferences.data,
              privacy: preferences.privacy,
            });
            setPreferences(updated);
          }
          break;
        }
        case 'merge': {
          const remotePrefs = await userPreferencesService.forceSync(userId);
          if (preferences) {
            const merged = await userPreferencesService.updatePreferences(userId, {
              theme: { ...remotePrefs.theme, ...preferences.theme },
              competition: { ...remotePrefs.competition, ...preferences.competition },
              notifications: { ...remotePrefs.notifications, ...preferences.notifications },
              data: { ...remotePrefs.data, ...preferences.data },
              privacy: { ...remotePrefs.privacy, ...preferences.privacy },
            });
            setPreferences(merged);
          } else {
            setPreferences(remotePrefs);
          }
          break;
        }
      }

      reportInfo('useUserPreferences', 'Conflicts resolved', { resolution });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to resolve conflicts';
      setError(errorMessage);
      reportStoreError('resolveConflicts', 'userPreferences', err);
      throw err;
    }
  }, [userId, preferences]);

  /**
   * Force sync with server
   */
  const forceSync = useCallback(async () => {
    if (!userId) {
      throw new Error('No user ID provided');
    }

    try {
      setError(null);
      setLoading(true);
      
      const synced = await userPreferencesService.forceSync(userId);
      setPreferences(synced);
      
      reportInfo('useUserPreferences', 'Force sync completed');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to sync preferences';
      setError(errorMessage);
      reportStoreError('forceSync', 'userPreferences', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  /**
   * Register device
   */
  const registerDevice = useCallback(async () => {
    if (!userId) {
      throw new Error('No user ID provided');
    }

    try {
      await userPreferencesService.registerDevice(userId);
      
      // Reload devices list
      const deviceList = await userPreferencesService.getDevices(userId);
      setDevices(deviceList);
      
      reportInfo('useUserPreferences', 'Device registered successfully');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to register device';
      setError(errorMessage);
      reportStoreError('registerDevice', 'userPreferences', err);
      throw err;
    }
  }, [userId]);

  /**
   * Remove device
   */
  const removeDevice = useCallback(async (deviceId: string) => {
    if (!userId) {
      throw new Error('No user ID provided');
    }

    try {
      await userPreferencesService.removeDevice(userId, deviceId);
      
      // Update devices list
      setDevices(prev => prev.filter(d => d.id !== deviceId));
      
      reportInfo('useUserPreferences', 'Device removed successfully', { deviceId });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to remove device';
      setError(errorMessage);
      reportStoreError('removeDevice', 'userPreferences', err);
      throw err;
    }
  }, [userId]);

  /**
   * Handle sync state changes
   */
  const updateSyncState = useCallback(() => {
    setSyncState(userPreferencesService.getSyncState());
  }, []);

  /**
   * Handle preferences updates from other devices
   */
  const handlePreferencesUpdate = useCallback((event: CustomEvent) => {
    const { preferences: updatedPrefs, source } = event.detail;
    
    if (source === 'remote' && updatedPrefs.userId === userId) {
      setPreferences(updatedPrefs);
      reportInfo('useUserPreferences', 'Received preferences update from another device');
    }
  }, [userId]);

  // Initialize when userId changes
  useEffect(() => {
    if (userId && userId !== currentUserIdRef.current) {
      currentUserIdRef.current = userId;
      isInitializedRef.current = false;
      
      loadPreferences(userId);
    } else if (!userId) {
      currentUserIdRef.current = null;
      setPreferences(null);
      setDevices([]);
      setError(null);
      isInitializedRef.current = false;
    }
  }, [userId, loadPreferences]);

  // Set up event listeners
  useEffect(() => {
    // Listen for preferences updates
    window.addEventListener('preferences-updated', handlePreferencesUpdate as EventListener);
    
    // Listen for sync state changes
    const syncInterval = setInterval(updateSyncState, 1000);
    
    return () => {
      window.removeEventListener('preferences-updated', handlePreferencesUpdate as EventListener);
      clearInterval(syncInterval);
    };
  }, [handlePreferencesUpdate, updateSyncState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cleanup is handled by the service singleton
    };
  }, []);

  return {
    // State
    preferences,
    loading,
    error,
    syncState,
    devices,
    
    // Actions
    updatePreferences,
    resetToDefaults,
    exportPreferences,
    importPreferences,
    resolveConflicts,
    forceSync,
    registerDevice,
    removeDevice,
  };
}