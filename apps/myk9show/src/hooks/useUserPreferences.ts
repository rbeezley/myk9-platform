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
  deviceThemeOrDefaults,
  readDeviceTheme,
  recordLocalThemeChange,
  seedDeviceTheme,
  writeDeviceTheme,
} from '@/services/preferences/deviceThemeCache';
import { enqueuePreferenceWrite, syncDeviceTheme } from '@/services/preferences/themeSync';
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
  const isOnlineRef = useRef(isOnline);
  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  const currentUserIdRef = useRef<string | null>(null);
  const onServerThemeRef = useRef(onServerTheme);
  useEffect(() => {
    onServerThemeRef.current = onServerTheme;
  }, [onServerTheme]);

  // A result that arrives after sign-out, a user switch or unmount is dropped.
  const isCurrent = (uid: string) => currentUserIdRef.current === uid;

  const showTheme = useCallback((uid: string, theme: ThemePreferences) => {
    setPreferences(prev => ({ ...(prev ?? buildDefaults(uid)), theme }));
  }, []);

  /** Pull the server row, reconcile with the device copy, push newer local edits. */
  const syncTheme = useCallback(
    (uid: string) =>
      syncDeviceTheme(uid, {
        isCurrent: () => isCurrent(uid),
        onPreferences: setPreferences,
        onServerTheme: adopted => onServerThemeRef.current?.(adopted),
      }),
    []
  );

  const loadPreferences = useCallback(
    async (uid: string) => {
      // No device copy yet: start from what this device already shows, not defaults.
      const saved = readDeviceTheme(uid);
      const cache = saved ?? seedDeviceTheme(uid);
      showTheme(uid, deviceThemeOrDefaults(cache));
      // Offline the device copy (or defaults) is the whole answer: no server wait.
      if (!isOnlineRef.current) {
        setLoading(false);
        return;
      }
      try {
        setLoading(!saved);
        setError(null);
        await syncTheme(uid);
        reportInfo('useUserPreferences', 'Preferences loaded successfully', { userId: uid });
      } catch (err: unknown) {
        // Offline or server trouble: the device copy (or defaults) is the answer.
        reportStoreError('loadPreferences', 'userPreferences', err);
      } finally {
        if (isCurrent(uid)) setLoading(false);
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
      if (themeUpdate) {
        const cache = recordLocalThemeChange(userId, themeUpdate);
        showTheme(userId, deviceThemeOrDefaults(cache));
      }
      if (!isOnline) return;

      if (hasServerOnly) {
        try {
          const updated = await enqueuePreferenceWrite(userId, () =>
            userPreferencesService.updatePreferences(userId, serverOnly)
          );
          if (isCurrent(userId)) {
            setPreferences(prev => ({ ...updated, theme: prev?.theme ?? updated.theme }));
          }
        } catch (err: unknown) {
          reportStoreError('updatePreferences', 'userPreferences', err);
          setError(err instanceof Error ? err.message : 'Failed to update preferences');
          throw err;
        }
      }
      if (themeUpdate) {
        // Already saved on the device; a failed push stays pending for the next sync.
        await syncTheme(userId).catch(err =>
          reportStoreError('updatePreferences', 'userPreferences', err)
        );
      }
      reportInfo('useUserPreferences', 'Preferences updated successfully', { updates });
    },
    [userId, isOnline, showTheme, syncTheme]
  );

  const resetToDefaults = useCallback(
    async (category?: keyof PreferencesUpdate) => {
      if (!userId) {
        throw new Error('No user ID provided');
      }
      if (category === 'theme') {
        const defaults = buildDefaults(userId).theme;
        await updatePreferences({ theme: defaults });
        // The applied theme (mode, ring color) must follow the reset, not just the saved value.
        onServerThemeRef.current?.(defaults);
        return;
      }
      if (!isOnline) throw new Error(NEEDS_CONNECTION_MESSAGE);
      try {
        setError(null);
        const reset = await enqueuePreferenceWrite(userId, () =>
          userPreferencesService.resetToDefaults(userId, category)
        );
        if (!isCurrent(userId)) return;
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

  useEffect(
    () => () => {
      currentUserIdRef.current = null;
    },
    []
  );

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
