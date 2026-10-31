/**
 * User Preferences Hook
 *
 * Local-first (MYK9-1545): the theme category (device-level appearance) is read
 * from and written to a per-user device copy first and applied at once; the
 * server is a sync target (see services/preferences/deviceThemeCache.ts for the
 * conflict rule). Every other category is server-only and needs a connection.
 * The hook, not the service, owns this because it has the online signal and the
 * only UI caller; the service stays a plain server client.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  buildDefaults,
  userPreferencesService,
} from '@/services/preferences/userPreferencesService';
import {
  clearPending,
  deviceThemeOrDefaults,
  readDeviceTheme,
  reconcileTheme,
  recordLocalThemeChange,
  writeDeviceTheme,
} from '@/services/preferences/deviceThemeCache';
import { useOnlineStatus } from '@/lib/networkUtils';
import { reportInfo, reportStoreError } from '@/utils/standardizedErrorHandler';
import type {
  UserPreferences,
  PreferencesUpdate,
  ThemePreferences,
} from '@/types/user-preferences';

export const NEEDS_CONNECTION_MESSAGE = 'Needs a connection';

export interface UseUserPreferencesReturn {
  preferences: UserPreferences | null;
  loading: boolean;
  error: string | null;
  updatePreferences: (updates: PreferencesUpdate) => Promise<void>;
  resetToDefaults: (category?: keyof PreferencesUpdate) => Promise<void>;
}

/** `onServerTheme` receives theme fields where a newer server value replaced this device's. */
export function useUserPreferences(
  userId: string | null,
  onServerTheme?: (adopted: Partial<ThemePreferences>) => void
): UseUserPreferencesReturn {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOnline = useOnlineStatus();

  const currentUserIdRef = useRef<string | null>(null);
  const onServerThemeRef = useRef(onServerTheme);
  useEffect(() => {
    onServerThemeRef.current = onServerTheme;
  }, [onServerTheme]);

  const showTheme = useCallback((uid: string, theme: ThemePreferences) => {
    setPreferences(prev => ({ ...(prev ?? buildDefaults(uid)), theme }));
  }, []);

  /** Pull the server row, reconcile with the device copy, push newer local edits. */
  const syncTheme = useCallback(async (uid: string) => {
    const server = await userPreferencesService.loadPreferences(uid);
    const cache = readDeviceTheme(uid);
    const { theme, toPush, adoptedFromServer } = reconcileTheme(
      cache,
      server.theme,
      server.updatedAt.getTime()
    );
    const sentAt = { ...(cache?.changedAt ?? {}) };
    writeDeviceTheme(uid, {
      theme,
      changedAt: cache?.changedAt ?? {},
      pending: cache?.pending ?? [],
    });
    setPreferences({ ...server, theme });
    if (Object.keys(adoptedFromServer).length > 0) onServerThemeRef.current?.(adoptedFromServer);
    if (Object.keys(toPush).length > 0) {
      await userPreferencesService.updatePreferences(uid, { theme: toPush });
    }
    // Every field that was pending is now settled on the server (pushed, or
    // replaced by a newer server value); an edit made mid-sync stays pending.
    clearPending(uid, theme, cache?.pending ?? [], sentAt);
  }, []);

  const loadPreferences = useCallback(
    async (uid: string) => {
      const cache = readDeviceTheme(uid);
      if (cache) showTheme(uid, deviceThemeOrDefaults(cache));
      try {
        setLoading(!cache);
        setError(null);
        await syncTheme(uid);
        reportInfo('useUserPreferences', 'Preferences loaded successfully', { userId: uid });
      } catch (err: unknown) {
        // Offline or server trouble: the device copy (or defaults) is the answer.
        if (!cache) showTheme(uid, deviceThemeOrDefaults(null));
        reportStoreError('loadPreferences', 'userPreferences', err);
      } finally {
        setLoading(false);
      }
    },
    [showTheme, syncTheme]
  );

  const updatePreferences = useCallback(
    async (updates: PreferencesUpdate) => {
      if (!userId) {
        throw new Error('No user ID provided');
      }
      const { theme: themeUpdate, ...serverOnly } = updates;
      const hasServerOnly = Object.keys(serverOnly).length > 0;
      if (hasServerOnly && !isOnline) throw new Error(NEEDS_CONNECTION_MESSAGE);

      setError(null);
      let sentAt: Partial<Record<keyof ThemePreferences, number>> = {};
      if (themeUpdate) {
        const cache = recordLocalThemeChange(userId, themeUpdate);
        sentAt = { ...cache.changedAt };
        showTheme(userId, deviceThemeOrDefaults(cache));
      }
      if (!isOnline) return;

      try {
        const updated = await userPreferencesService.updatePreferences(userId, updates);
        if (themeUpdate) {
          const cleared = clearPending(
            userId,
            updated.theme,
            Object.keys(themeUpdate) as Array<keyof ThemePreferences>,
            sentAt
          );
          setPreferences({ ...updated, theme: deviceThemeOrDefaults(cleared) });
        } else {
          setPreferences(prev => ({ ...updated, theme: prev?.theme ?? updated.theme }));
        }
        reportInfo('useUserPreferences', 'Preferences updated successfully', { updates });
      } catch (err: unknown) {
        reportStoreError('updatePreferences', 'userPreferences', err);
        // A theme-only change is already saved on the device and stays pending
        // for the next sync; only server-only changes can truly fail.
        if (hasServerOnly) {
          setError(err instanceof Error ? err.message : 'Failed to update preferences');
          throw err;
        }
      }
    },
    [userId, isOnline, showTheme]
  );

  const resetToDefaults = useCallback(
    async (category?: keyof PreferencesUpdate) => {
      if (!userId) {
        throw new Error('No user ID provided');
      }
      if (category === 'theme') {
        const defaults = buildDefaults(userId).theme;
        await updatePreferences({ theme: defaults });
        return;
      }
      if (!isOnline) throw new Error(NEEDS_CONNECTION_MESSAGE);
      try {
        setError(null);
        const reset = await userPreferencesService.resetToDefaults(userId, category);
        // The reset wrote the server row; mirror theme into the device copy.
        const cache = readDeviceTheme(userId);
        const theme = category === undefined ? reset.theme : deviceThemeOrDefaults(cache);
        if (category === undefined) {
          writeDeviceTheme(userId, { theme, changedAt: {}, pending: [] });
          onServerThemeRef.current?.(theme);
        }
        setPreferences({ ...reset, theme });
        reportInfo('useUserPreferences', 'Preferences reset to defaults', { category });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to reset preferences');
        reportStoreError('resetPreferences', 'userPreferences', err);
        throw err;
      }
    },
    [userId, isOnline, updatePreferences]
  );

  // Initialize when userId changes
  useEffect(() => {
    if (userId && userId !== currentUserIdRef.current) {
      currentUserIdRef.current = userId;
      void loadPreferences(userId);
    } else if (!userId) {
      currentUserIdRef.current = null;
      setPreferences(null);
      setError(null);
    }
  }, [userId, loadPreferences]);

  // Back online with unsent device changes (or a stale copy): sync again.
  const wasOnlineRef = useRef(isOnline);
  useEffect(() => {
    const cameBack = isOnline && !wasOnlineRef.current;
    wasOnlineRef.current = isOnline;
    if (cameBack && userId) {
      syncTheme(userId).catch(err => reportStoreError('syncPreferences', 'userPreferences', err));
    }
  }, [isOnline, userId, syncTheme]);

  return { preferences, loading, error, updatePreferences, resetToDefaults };
}
