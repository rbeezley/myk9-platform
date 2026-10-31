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

  const wasOnlineRef = useRef(isOnline);
  useEffect(() => {
    const cameBack = isOnline && !wasOnlineRef.current;
    wasOnlineRef.current = isOnline;
    if (!cameBack || !userId || !hasPendingThemeChanges(userId)) return;
    syncDeviceTheme(userId, {
      isCurrent: () => userIdRef.current === userId,
      onServerTheme: adopted => applyRef.current(adopted),
    }).catch(err => reportStoreError('syncPreferences', 'userPreferences', err));
  }, [isOnline, userId]);
}
