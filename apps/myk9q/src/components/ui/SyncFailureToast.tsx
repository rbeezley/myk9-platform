/**
 * SyncFailureToast - Shows toast notifications for sync failures
 *
 * Listens for replication events and displays user-friendly toasts:
 * - `replication:sync-failed` - When data fails to sync
 * - `replication:queue-overflow` - When mutation queue is full
 *
 * Features:
 * - Auto-dismisses after 10 seconds
 * - "Retry" button triggers sync
 * - "Dismiss" button hides the toast
 * - Only shows when user is online (offline state handled by OfflineIndicator)
 */

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, RefreshCw, X, CloudOff } from 'lucide-react';
import { refreshAllTables } from '@/services/replication/initReplication';
import { logger } from '@/utils/logger';
import { cn } from '@/lib/utils';

/** Tailwind styles for SyncFailureToast */
const styles = {
  container: cn(
    "fixed z-[9999] pointer-events-none",
    "bottom-[var(--token-space-xl)] left-1/2 -translate-x-1/2",
    "max-w-[90%] w-[400px]",
    "max-[480px]:bottom-[calc(var(--token-space-xl)+env(safe-area-inset-bottom,0px))]",
    "max-[480px]:left-[var(--token-space-md)] max-[480px]:right-[var(--token-space-md)]",
    "max-[480px]:translate-x-0 max-[480px]:w-auto max-[480px]:max-w-none"
  ),
  toast: cn(
    "bg-[var(--card)] border border-[var(--border)]",
    "rounded-[var(--token-space-lg)]",
    "shadow-[0_4px_20px_rgba(0,0,0,0.15)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)]",
    "p-[var(--token-space-lg)] max-[480px]:p-[var(--token-space-md)]",
    "flex items-start gap-[var(--token-space-md)]",
    "pointer-events-auto animate-[slideUp_0.3s_ease-out]"
  ),
  toastSyncFailed: "border-l-4 border-l-[var(--token-warning)]",
  toastQueueOverflow: "border-l-4 border-l-[var(--token-error)]",
  icon: cn(
    "flex-shrink-0 flex items-center justify-center",
    "w-10 h-10 max-[480px]:w-8 max-[480px]:h-8",
    "rounded-[var(--token-space-md)]",
    "[&_svg]:max-[480px]:w-[18px] [&_svg]:max-[480px]:h-[18px]"
  ),
  iconWarning: "bg-[var(--token-warning-light,rgba(234,179,8,0.1))] text-[var(--token-warning)]",
  iconError: "bg-[var(--token-error-light,rgba(239,68,68,0.1))] text-[var(--token-error)]",
  content: "flex-1 min-w-0",
  message: "m-0 text-[var(--token-font-sm)] text-[var(--foreground)] leading-[1.4]",
  count: "mt-[var(--token-space-xs)] text-[var(--token-font-xs)] text-[var(--token-text-tertiary)]",
  actions: "flex items-center gap-[var(--token-space-sm)] flex-shrink-0",
  btn: cn(
    "flex items-center justify-center gap-[var(--token-space-xs)]",
    "px-[var(--token-space-md)] py-[var(--token-space-sm)]",
    "rounded-[var(--token-space-md)]",
    "text-[var(--token-font-sm)] font-[var(--token-font-weight-medium)]",
    "cursor-pointer transition-all duration-150 border-none"
  ),
  btnPrimary: cn(
    "bg-[var(--primary)] text-[var(--primary-foreground)]",
    "hover:enabled:opacity-90",
    "disabled:opacity-60 disabled:cursor-not-allowed"
  ),
  btnDismiss: cn(
    "bg-transparent text-[var(--token-text-secondary)]",
    "p-[var(--token-space-sm)]",
    "hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
  ),
  spinning: "animate-spin",
};

interface SyncFailure {
  id: string;
  type: 'sync-failed' | 'queue-overflow';
  message: string;
  timestamp: number;
}

const AUTO_DISMISS_MS = 10000; // 10 seconds

export function SyncFailureToast() {
  const [failures, setFailures] = useState<SyncFailure[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Listen for sync failure events
  useEffect(() => {
    const handleSyncFailed = (event: CustomEvent) => {
      // Only show toast if online (offline state is handled elsewhere)
      if (!navigator.onLine) return;

      // Don't show sync failures during onboarding - confuses new users
      if (!localStorage.getItem('onboarding_completed')) return;

      const { message, count } = event.detail;
      const failureMessage = count > 0
        ? `${count} change(s) failed to sync. Please check your connection.`
        : message || 'Some changes failed to sync.';

      const newFailure: SyncFailure = {
        id: `sync-${Date.now()}`,
        type: 'sync-failed',
        message: failureMessage,
        timestamp: Date.now(),
      };

      logger.warn('[SyncFailureToast] Sync failure:', failureMessage);

      setFailures((prev) => {
        // Don't add duplicate failures within 30 seconds
        const recentSimilar = prev.find(
          (f) => f.type === 'sync-failed' && Date.now() - f.timestamp < 30000
        );
        if (recentSimilar) return prev;
        return [...prev, newFailure];
      });
    };

    const handleQueueOverflow = (event: CustomEvent) => {
      const { queueSize, maxSize } = event.detail;
      const message = `Too many pending changes (${queueSize}/${maxSize}). Please sync immediately!`;

      const newFailure: SyncFailure = {
        id: `overflow-${Date.now()}`,
        type: 'queue-overflow',
        message,
        timestamp: Date.now(),
      };

      logger.error('[SyncFailureToast] Queue overflow:', message);

      setFailures((prev) => {
        // Don't add duplicate overflow warnings within 60 seconds
        const recentOverflow = prev.find(
          (f) => f.type === 'queue-overflow' && Date.now() - f.timestamp < 60000
        );
        if (recentOverflow) return prev;
        return [...prev, newFailure];
      });
    };

    window.addEventListener('replication:sync-failed', handleSyncFailed as EventListener);
    window.addEventListener('replication:queue-overflow', handleQueueOverflow as EventListener);

    return () => {
      window.removeEventListener('replication:sync-failed', handleSyncFailed as EventListener);
      window.removeEventListener('replication:queue-overflow', handleQueueOverflow as EventListener);
    };
  }, []);

  // Auto-dismiss old failures
  useEffect(() => {
    if (failures.length === 0) return;

    const timer = setInterval(() => {
      const now = Date.now();
      setFailures((prev) =>
        prev.filter((f) => now - f.timestamp < AUTO_DISMISS_MS)
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [failures.length]);

  const handleDismiss = useCallback((id: string) => {
    setFailures((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleRetry = useCallback(async () => {
    setIsSyncing(true);
    try {
      await refreshAllTables();
      // Clear all failures on successful retry
      setFailures([]);
    } catch (error) {
      logger.error('[SyncFailureToast] Retry failed:', error);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  if (failures.length === 0) return null;

  // Show only the most recent failure
  const latestFailure = failures[failures.length - 1];

  const isQueueOverflow = latestFailure.type === 'queue-overflow';

  return (
    <div className={styles.container} role="alert" aria-live="polite">
      <div className={cn(
        styles.toast,
        isQueueOverflow ? styles.toastQueueOverflow : styles.toastSyncFailed
      )}>
        <div className={cn(
          styles.icon,
          isQueueOverflow ? styles.iconError : styles.iconWarning
        )}>
          {isQueueOverflow ? (
            <CloudOff size={24} />
          ) : (
            <AlertTriangle size={24} />
          )}
        </div>

        <div className={styles.content}>
          <p className={styles.message}>{latestFailure.message}</p>
          {failures.length > 1 && (
            <p className={styles.count}>
              +{failures.length - 1} more
            </p>
          )}
        </div>

        <div className={styles.actions}>
          <button
            className={cn(styles.btn, styles.btnPrimary)}
            onClick={handleRetry}
            disabled={isSyncing}
          >
            <RefreshCw size={16} className={isSyncing ? styles.spinning : ''} />
            {isSyncing ? 'Syncing...' : 'Retry'}
          </button>
          <button
            className={cn(styles.btn, styles.btnDismiss)}
            onClick={() => handleDismiss(latestFailure.id)}
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default SyncFailureToast;
