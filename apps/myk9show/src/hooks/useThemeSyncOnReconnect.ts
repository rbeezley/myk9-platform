import { useEffect, useRef } from 'react';
import { useAuthUser } from '@/hooks/useAuthUser';
import { useApplyServerTheme } from '@/hooks/useApplyServerTheme';
import { useOnlineStatus } from '@/lib/networkUtils';
import { hasPendingThemeChanges, syncDeviceTheme } from '@/services/preferences/themeSync';
import { reportStoreError } from '@/utils/standardizedErrorHandler';

/**
 * App-level trigger (MYK9-1564): appearance changed offline syncs when the
 * connection returns, wherever the user is, not only while Account is open.
 * Shares the write queue with `useUserPreferences` through `themeSync`.
 */
export function useThemeSyncOnReconnect() {
  const userId = useAuthUser()?.id ?? null;
  const isOnline = useOnlineStatus();
  const applyServerTheme = useApplyServerTheme();
  const applyRef = useRef(applyServerTheme);
  useEffect(() => {
    applyRef.current = applyServerTheme;
  }, [applyServerTheme]);

  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  // Level condition: online + signed in + pending edits => one sync per user per
  // online session. The epoch bumps when the connection drops, so reconnect,
  // cold start online and auth arriving after connectivity all take this path.
  const epochRef = useRef(0);
  const syncedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isOnline) {
      epochRef.current += 1;
      return;
    }
    if (!userId || !hasPendingThemeChanges(userId)) return;
    const key = `${userId}:${epochRef.current}`;
    if (syncedKeyRef.current === key) return;
    syncedKeyRef.current = key;
    syncDeviceTheme(userId, {
      isCurrent: () => userIdRef.current === userId,
      onServerTheme: adopted => applyRef.current(adopted),
    }).catch(err => reportStoreError('syncPreferences', 'userPreferences', err));
  }, [isOnline, userId]);
}
