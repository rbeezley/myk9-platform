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
import './SyncFailureToast.css';

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

  return (
    <div className="sync-failure-toast-container" role="alert" aria-live="polite">
      <div className={`sync-failure-toast sync-failure-toast--${latestFailure.type}`}>
        <div className="sync-failure-toast__icon">
          {latestFailure.type === 'queue-overflow' ? (
            <CloudOff size={24} />
          ) : (
            <AlertTriangle size={24} />
          )}
        </div>

        <div className="sync-failure-toast__content">
          <p className="sync-failure-toast__message">{latestFailure.message}</p>
          {failures.length > 1 && (
            <p className="sync-failure-toast__count">
              +{failures.length - 1} more
            </p>
          )}
        </div>

        <div className="sync-failure-toast__actions">
          <button
            className="sync-failure-toast__btn sync-failure-toast__btn--primary"
            onClick={handleRetry}
            disabled={isSyncing}
          >
            <RefreshCw size={16} className={isSyncing ? 'spinning' : ''} />
            {isSyncing ? 'Syncing...' : 'Retry'}
          </button>
          <button
            className="sync-failure-toast__btn sync-failure-toast__btn--dismiss"
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
