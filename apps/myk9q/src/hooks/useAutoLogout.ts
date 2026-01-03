/**
 * useAutoLogout Hook
 *
 * Automatically logs out the user after a period of inactivity.
 * Monitors user activity (mouse, keyboard, touch) and logs out when timeout is reached.
 * Shows warning modal 5 minutes before logout.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSettingsStore } from '@/stores/settingsStore';
import { logger } from '@/utils/logger';

const WARNING_TIME_MS = 5 * 60 * 1000; // 5 minutes before logout

export function useAutoLogout() {
  const { logout, isAuthenticated } = useAuth();
  const { settings } = useSettingsStore();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(0);
  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [pendingScoresBlocking, setPendingScoresBlocking] = useState(false);

  // Initialize lastActivityRef in useEffect
  useEffect(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // Reset the inactivity timer
  const resetTimer = useCallback(() => {
    // Clear existing timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }

    // Hide warning if it was showing
    setShowWarning(false);

    // Update last activity time
    lastActivityRef.current = Date.now();

    // Don't set timer if user not authenticated
    if (!isAuthenticated) {
      return;
    }

    // Convert minutes to milliseconds
    const timeoutMs = settings.autoLogout * 60 * 1000;

    // Set warning timeout (5 minutes before logout)
    const warningMs = timeoutMs - WARNING_TIME_MS;
    if (warningMs > 0) {
      warningTimeoutRef.current = setTimeout(() => {
setShowWarning(true);
        setSecondsRemaining(Math.floor(WARNING_TIME_MS / 1000));
      }, warningMs);
    }

    // Set logout timeout
    timeoutRef.current = setTimeout(async () => {
      // Call logout - it now returns a result indicating if blocked
      const result = await logout();

      if (result.blocked) {
        // Logout was blocked due to pending scores
        logger.warn(
          `[AUTO_LOGOUT] Blocked - ${result.pendingCount} pending + ${result.failedCount} failed score(s) would be lost. Extending session.`
        );
        setPendingScoresBlocking(true);
        setShowWarning(true);
        // Keep showing warning but don't logout
        return;
      }

      setShowWarning(false);
      setPendingScoresBlocking(false);
    }, timeoutMs);
  }, [settings.autoLogout, logout, isAuthenticated]);

  // Handle user activity
  const handleActivity = useCallback(() => {
    resetTimer();
  }, [resetTimer]);

  // Extend session by 1 hour
  const extendSession = useCallback(() => {
resetTimer();
  }, [resetTimer]);

  // Logout immediately (but still check for pending scores)
  const logoutNow = useCallback(async () => {
    // Call logout - it now returns a result indicating if blocked
    const result = await logout();

    if (result.blocked) {
      // Block logout - show pending scores warning instead
      logger.warn(
        `[AUTO_LOGOUT] logoutNow blocked - ${result.pendingCount} pending + ${result.failedCount} failed score(s) would be lost`
      );
      setPendingScoresBlocking(true);
      // Keep warning visible but don't logout
      return;
    }

    setShowWarning(false);
    setPendingScoresBlocking(false);
  }, [logout]);

  // Dismiss warning (user became active)
  const dismissWarning = useCallback(() => {
    setPendingScoresBlocking(false);
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    // Only enable auto-logout if user is authenticated
    if (!isAuthenticated) {
      // Clear any existing timer
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
        warningTimeoutRef.current = null;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowWarning(false);
      return;
    }

    // Activity events to monitor
    const events = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click',
    ];

    // Add event listeners
    events.forEach((event) => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Start the initial timer
    resetTimer();

    // Cleanup
    return () => {
      // Remove event listeners
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });

      // Clear timeouts
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
    };
  }, [isAuthenticated, settings.autoLogout, handleActivity, resetTimer]);

  // Expose warning state and handlers
  return {
    resetTimer,
    showWarning,
    secondsRemaining,
    extendSession,
    logoutNow,
    dismissWarning,
    /** True if auto-logout is blocked due to pending scores */
    pendingScoresBlocking,
  };
}
