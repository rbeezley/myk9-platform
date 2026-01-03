/**
 * useSafeLogout Hook
 *
 * Provides a safe logout mechanism that prevents data loss by checking
 * for pending unsynced changes before allowing logout.
 *
 * **Why This Matters:**
 * When judging offline, scores and other changes are queued in IndexedDB
 * until connectivity is restored. If a user logs out before syncing, ALL
 * pending changes are permanently lost (logout clears the cache).
 * This hook prevents that scenario.
 *
 * **What It Checks:**
 * 1. Offline score queue (offlineQueueStore) - submitted scores waiting to sync
 * 2. Pending mutations (IndexedDB) - class status changes, check-ins, etc.
 *
 * **Behavior:**
 * - If pending changes exist → shows warning dialog, blocks logout
 * - If offline (no pending changes) → shows offline warning (can't re-login without WiFi)
 * - If online with no pending changes → logout proceeds normally
 * - Dialog shows sync status and instructions for safely syncing
 */

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQueueStore } from '@/stores/offlineQueueStore';
import { getPendingMutationCount } from '@/stores/syncStatusStore';
import { logger } from '@/utils/logger';

/** Type of warning being shown */
export type LogoutWarningType = 'pending_scores' | 'pending_changes' | 'offline' | null;

interface UseSafeLogoutResult {
  /**
   * Attempts a safe logout. If pending changes exist, shows warning dialog.
   * If offline, shows offline warning. If online with no pending changes, logs out immediately.
   */
  safeLogout: () => void;

  /**
   * Forces logout regardless of pending changes or offline status.
   * Use with extreme caution - will lose all unsynced data!
   */
  forceLogout: () => void;

  /**
   * Whether the warning dialog should be shown
   */
  showWarningDialog: boolean;

  /**
   * The type of warning being shown (for UI to display appropriate message)
   */
  warningType: LogoutWarningType;

  /**
   * Close the warning dialog without logging out
   */
  closeWarningDialog: () => void;

  /**
   * Number of scores pending sync
   */
  pendingScoreCount: number;

  /**
   * Number of other mutations pending sync (class status, etc.)
   */
  pendingMutationCount: number;

  /**
   * Total number of pending changes (scores + mutations)
   */
  totalPendingCount: number;

  /**
   * Whether the device is currently online
   */
  isOnline: boolean;

  /**
   * Whether sync is currently in progress
   */
  isSyncing: boolean;
}

export function useSafeLogout(): UseSafeLogoutResult {
  const { logout } = useAuth();
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const [warningType, setWarningType] = useState<LogoutWarningType>(null);
  const [pendingMutationCount, setPendingMutationCount] = useState(0);

  // Get offline queue state (scores)
  const pendingScoreCount = useOfflineQueueStore((state) => state.getPendingCount());
  const isOnline = useOfflineQueueStore((state) => state.isOnline);
  const isSyncing = useOfflineQueueStore((state) => state.isSyncing);

  // Fetch pending mutations count on mount and periodically
  useEffect(() => {
    const fetchMutationCount = async () => {
      const count = await getPendingMutationCount();
      setPendingMutationCount(count);
    };

    // Initial fetch
    fetchMutationCount();

    // Poll every 10 seconds to keep count fresh
    const interval = setInterval(fetchMutationCount, 10000);
    return () => clearInterval(interval);
  }, []);

  // Total pending = scores + mutations
  const totalPendingCount = pendingScoreCount + pendingMutationCount;

  /**
   * Attempts safe logout - checks for ALL pending changes and offline status
   *
   * Priority order:
   * 1. Pending scores → BLOCK (data would be lost)
   * 2. Pending mutations → BLOCK (class status changes would be lost)
   * 3. Offline (no pending) → WARN (can't re-login without connectivity)
   * 4. Online (no pending) → ALLOW immediate logout
   */
  const safeLogout = useCallback(async () => {
    // Get fresh state at logout time (not stale from render)
    const currentScoreCount = useOfflineQueueStore.getState().getPendingCount();
    const currentIsOnline = useOfflineQueueStore.getState().isOnline;

    // Also check pending mutations from IndexedDB
    const currentMutationCount = await getPendingMutationCount();
    const totalPending = currentScoreCount + currentMutationCount;

    if (currentScoreCount > 0) {
      // BLOCK: Pending scores would be lost
      logger.warn(
        `[SAFE_LOGOUT] Blocking logout - ${currentScoreCount} pending score(s) would be lost`
      );
      setWarningType('pending_scores');
      setShowWarningDialog(true);
    } else if (currentMutationCount > 0) {
      // BLOCK: Pending mutations would be lost
      logger.warn(
        `[SAFE_LOGOUT] Blocking logout - ${currentMutationCount} pending change(s) would be lost ` +
        `(class status updates, check-ins, etc.)`
      );
      setWarningType('pending_changes');
      setShowWarningDialog(true);
    } else if (!currentIsOnline) {
      // WARN: User is offline, can't re-login without WiFi
      logger.warn(
        '[SAFE_LOGOUT] Warning: User is offline - logout will prevent re-login until connectivity restored'
      );
      setWarningType('offline');
      setShowWarningDialog(true);
    } else {
      // ALLOW: Online with no pending changes - safe to logout
      logger.log(`[SAFE_LOGOUT] ✅ Safe to logout - ${totalPending} pending changes`);
      logout();
    }
  }, [logout]);

  /**
   * Forces logout regardless of pending changes
   * This is intentionally not exposed in the UI by default,
   * but available for emergency use cases
   */
  const forceLogout = useCallback(async () => {
    const currentScoreCount = useOfflineQueueStore.getState().getPendingCount();
    const currentMutationCount = await getPendingMutationCount();
    const totalPending = currentScoreCount + currentMutationCount;

    if (totalPending > 0) {
      logger.error(
        `[SAFE_LOGOUT] ⚠️ FORCE LOGOUT - ${currentScoreCount} score(s) + ${currentMutationCount} mutation(s) WILL BE LOST!`
      );
    }
    setShowWarningDialog(false);
    logout();
  }, [logout]);

  /**
   * Closes the warning dialog without logging out
   */
  const closeWarningDialog = useCallback(() => {
    setShowWarningDialog(false);
    setWarningType(null);
  }, []);

  return {
    safeLogout,
    forceLogout,
    showWarningDialog,
    warningType,
    closeWarningDialog,
    pendingScoreCount,
    pendingMutationCount,
    totalPendingCount,
    isOnline,
    isSyncing,
  };
}
