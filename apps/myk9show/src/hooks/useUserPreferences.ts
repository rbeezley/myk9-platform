/**
 * User Preferences Hook
 *
 * React hook for loading, updating, and resetting user preferences.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { userPreferencesService } from '@/services/preferences/userPreferencesService';
import { reportInfo, reportStoreError } from '@/utils/standardizedErrorHandler';
import type { UserPreferences, PreferencesUpdate } from '@/types/user-preferences';

export interface UseUserPreferencesReturn {
  preferences: UserPreferences | null;
  loading: boolean;
  error: string | null;
  updatePreferences: (updates: PreferencesUpdate) => Promise<void>;
  resetToDefaults: (category?: keyof PreferencesUpdate) => Promise<void>;
}

export function useUserPreferences(userId: string | null): UseUserPreferencesReturn {
  // State
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const currentUserIdRef = useRef<string | null>(null);

  /**
   * Load user preferences
   */
  const loadPreferences = useCallback(async (uid: string) => {
    try {
      setLoading(true);
      setError(null);

      const prefs = await userPreferencesService.loadPreferences(uid);
      setPreferences(prefs);

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
  const updatePreferences = useCallback(
    async (updates: PreferencesUpdate) => {
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
    },
    [userId]
  );

  /**
   * Reset preferences to defaults
   */
  const resetToDefaults = useCallback(
    async (category?: keyof PreferencesUpdate) => {
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
    },
    [userId]
  );

  // Initialize when userId changes
  useEffect(() => {
    if (userId && userId !== currentUserIdRef.current) {
      currentUserIdRef.current = userId;
      loadPreferences(userId);
    } else if (!userId) {
      currentUserIdRef.current = null;
      setPreferences(null);
      setError(null);
    }
  }, [userId, loadPreferences]);

  return {
    preferences,
    loading,
    error,
    updatePreferences,
    resetToDefaults,
  };
}
