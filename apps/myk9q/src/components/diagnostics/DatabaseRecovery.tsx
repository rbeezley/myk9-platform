import React, { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw, CheckCircle, Loader, WifiOff } from 'lucide-react';
import { runIndexedDBDiagnostics, attemptAutoCleanup } from '@/utils/indexedDBDiagnostics';
import { stopReplicationManager } from '@/services/replication/ReplicationManager';
import { logger } from '@/utils/logger';
import { cn } from '@/lib/utils';

/** Tailwind styles for DatabaseRecovery */
const styles = {
  detecting: cn(
    "fixed z-[var(--token-z-modal)]",
    "bottom-[var(--token-space-3xl)] right-[var(--token-space-3xl)]",
    "flex items-center gap-[var(--token-space-md)]",
    "bg-[var(--background-secondary)] border border-[var(--border)]",
    "rounded-[var(--token-radius-md)]",
    "px-[var(--token-space-xl)] py-[var(--token-space-md)]",
    "shadow-[0_2px_8px_rgba(0,0,0,0.1)]"
  ),
  detectingIcon: cn(
    "w-4 h-4 text-[var(--primary)]",
    "animate-spin"
  ),
  modal: "fixed inset-0 z-[var(--token-z-toast)]",
  overlay: "absolute inset-0 bg-black/50",
  content: cn(
    "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
    "bg-[var(--background)]",
    "rounded-[var(--token-radius-lg)]",
    "shadow-[0_10px_40px_rgba(0,0,0,0.2)]",
    "w-[90%] max-w-[500px] sm:max-w-[600px]",
    "max-h-[80vh] overflow-y-auto"
  ),
  header: cn(
    "flex items-center gap-[var(--token-space-lg)]",
    "p-[var(--token-space-2xl)]",
    "border-b border-[var(--border)]"
  ),
  warningIcon: cn(
    "w-6 h-6 text-[var(--primary)]",
    "animate-spin"
  ),
  title: cn(
    "m-0 text-xl font-semibold",
    "text-[var(--foreground)]"
  ),
  body: "p-[var(--token-space-2xl)]",
  message: cn(
    "text-[var(--foreground-secondary)]",
    "mb-[var(--token-space-2xl)] leading-relaxed"
  ),
  status: cn(
    "flex items-center gap-[var(--token-space-md)]",
    "p-[var(--token-space-lg)]",
    "bg-[var(--background-secondary)]",
    "rounded-[var(--token-radius-md)]",
    "mb-[var(--token-space-2xl)]"
  ),
  statusIcon: "w-5 h-5",
  statusIconSpinning: "text-[var(--primary)] animate-spin",
  statusIconSuccess: "text-[var(--status-success)]",
  statusIconError: "text-[var(--status-error)]",
  actions: "flex gap-[var(--token-space-lg)]",
  btnPrimary: cn(
    "flex-1 flex items-center justify-center gap-[var(--token-space-sm)]",
    "px-[var(--token-space-xl)] py-[var(--token-space-md)]",
    "rounded-[var(--token-radius-md)]",
    "font-medium cursor-pointer border-none",
    "bg-[var(--primary)] text-white",
    "transition-all duration-200",
    "hover:bg-[var(--primary-hover)]"
  ),
  btnSecondary: cn(
    "flex-1 flex items-center justify-center gap-[var(--token-space-sm)]",
    "px-[var(--token-space-xl)] py-[var(--token-space-md)]",
    "rounded-[var(--token-radius-md)]",
    "font-medium cursor-pointer",
    "bg-[var(--background-secondary)] text-[var(--foreground)]",
    "border border-[var(--border)]",
    "transition-all duration-200",
    "hover:bg-[var(--background-tertiary)]"
  ),
  btnIcon: "w-4 h-4",
  manualInstructions: cn(
    "mt-[var(--token-space-2xl)] p-[var(--token-space-xl)]",
    "bg-[var(--background-secondary)]",
    "rounded-[var(--token-radius-md)]"
  ),
  manualTitle: cn(
    "m-0 mb-[var(--token-space-lg)]",
    "text-lg font-semibold text-[var(--foreground)]"
  ),
  manualList: cn(
    "m-0 pl-[var(--token-space-2xl)]",
    "text-[var(--foreground-secondary)] leading-[1.8]",
    "[&_li]:mb-[var(--token-space-sm)]"
  ),
};

interface DatabaseRecoveryProps {
  onRecovered?: () => void;
  onDismiss?: () => void;
}

export const DatabaseRecovery: React.FC<DatabaseRecoveryProps> = ({ onRecovered, onDismiss }) => {
  const [isDetecting, setIsDetecting] = useState(true);
  const [isCorrupted, setIsCorrupted] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState<string>('');
  const [showManualInstructions, setShowManualInstructions] = useState(false);
  const [autoRecoveryAttempted, setAutoRecoveryAttempted] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isDismissed, setIsDismissed] = useState(false);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    // SKIP DATABASE RECOVERY IN DEVELOPMENT ENTIRELY
    // This prevents false positives from HMR and rapid page reloads
    if (process.env.NODE_ENV === 'development') {
setIsDetecting(false);
      return;
    }

    // Only check once per browser session to avoid re-checking on navigation
    const sessionKey = 'myK9Q_db_checked';
    const hasCheckedThisSession = sessionStorage.getItem(sessionKey) === 'true';

    if (hasCheckedThisSession) {
      setIsDetecting(false);
      return;
    }

    const checkDelay = 100;

    const timeoutId = setTimeout(() => {
      sessionStorage.setItem(sessionKey, 'true');
      detectDatabaseIssues();
    }, checkDelay);

    // Listen for database errors in console
    const originalError = console.error;
    console.error = (...args) => {
      const errorMessage = args.join(' ');
      if (errorMessage.includes('Database open timed out') ||
          errorMessage.includes('database may be corrupted') ||
          errorMessage.includes('ReplicationManager] Failed to sync') ||
          errorMessage.includes('Failed to open IndexedDB') ||
          errorMessage.includes('IDBDatabase.transaction') ||
          errorMessage.includes('QuotaExceededError') ||
          errorMessage.includes('UnknownError') ||
          errorMessage.includes('VersionError')) {
setIsCorrupted(true);
        setIsDetecting(false);

        // Note: Auto-recovery will be triggered by detectDatabaseIssues
      }
      originalError.apply(console, args);
    };

    // Also listen for critical alerts
    const originalWarn = console.warn;
    console.warn = (...args) => {
      const warnMessage = args.join(' ');
      if (warnMessage.includes('CRITICAL ALERT') ||
          warnMessage.includes('Deleting corrupted database') ||
          warnMessage.includes('Database blocked') ||
          warnMessage.includes('Delete blocked')) {
setIsCorrupted(true);
        setIsDetecting(false);
      }
      originalWarn.apply(console, args);
    };

    // Cleanup
    return () => {
      clearTimeout(timeoutId);
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  const detectDatabaseIssues = async () => {
    try {
      setIsDetecting(true);

      // Run diagnostics
      const result = await runIndexedDBDiagnostics();

      if (result.status === 'corrupted' || result.status === 'locked') {
        // In development, double-check after a short delay to avoid false positives
        if (process.env.NODE_ENV === 'development' && result.status === 'locked') {
// Wait a moment and check again
          await new Promise(resolve => setTimeout(resolve, 500));
          const recheckResult = await runIndexedDBDiagnostics();

          if (recheckResult.status === 'healthy') {
setIsCorrupted(false);
            onRecovered?.();
            return;
          }
        }

        setIsCorrupted(true);

        // Show modal first, then attempt auto-recovery after a short delay
// Auto-attempt recovery after 2 seconds (gives user time to see what's happening)
        if (!autoRecoveryAttempted) {
          setAutoRecoveryAttempted(true);
          setTimeout(() => {
handleAutoRecovery();
          }, 2000);
        }
      } else if (result.status === 'healthy') {
        setIsCorrupted(false);
        onRecovered?.();
      }
    } catch (error) {
      logger.error('[DatabaseRecovery] Detection error:', error);
      setIsCorrupted(true);
    } finally {
      setIsDetecting(false);
    }
  };

  const backupPendingMutations = () => {
    try {
      // Backup offline queue to prevent data loss
      const offlineQueueData = localStorage.getItem('offline-queue-storage');
      if (offlineQueueData) {
        localStorage.setItem('myK9Q_mutation_backup', offlineQueueData);
}
    } catch (error) {
      logger.warn('[DatabaseRecovery] Could not backup mutations:', error);
    }
  };

  const restorePendingMutations = () => {
    try {
      const backup = localStorage.getItem('myK9Q_mutation_backup');
      if (backup) {
        localStorage.setItem('offline-queue-storage', backup);
        localStorage.removeItem('myK9Q_mutation_backup');
}
    } catch (error) {
      logger.warn('[DatabaseRecovery] Could not restore mutations:', error);
    }
  };

  const handleAutoRecovery = async () => {
    // CRITICAL: Never clear data when offline - prevents permanent data loss
    if (!isOnline) {
      setRecoveryStatus('⚠️ You are offline. Please connect to the internet before attempting recovery to prevent data loss.');
      setShowManualInstructions(false);
      setIsRecovering(false);
      return;
    }

    try {
      setIsRecovering(true);
      setRecoveryStatus('Backing up your offline work...');

      // CRITICAL: Backup pending mutations before ANY cleanup
      backupPendingMutations();

      setRecoveryStatus('Optimizing your local storage...');

      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Recovery timeout')), 10000) // 10 second timeout
      );

      // Create recovery promise
      const recoveryPromise = async () => {
        // First, try to stop any active replication
        try {
          await stopReplicationManager();
        } catch (error) {
          logger.warn('[DatabaseRecovery] Could not stop replication:', error);
        }

        // Attempt cleanup
        const cleanupResult = await attemptAutoCleanup();
        return cleanupResult;
      };

      // Race between recovery and timeout
      const cleanupResult = await Promise.race([
        recoveryPromise(),
        timeoutPromise
      ]) as { success: boolean; message?: string };

      if (cleanupResult.success) {
        setRecoveryStatus('Restoring your offline work...');

        // CRITICAL: Restore pending mutations after cleanup
        restorePendingMutations();

        setRecoveryStatus('Optimization complete! Refreshing...');

        // Re-enable replication after successful cleanup
        try {
          const { enableReplication } = await import('@/services/replication/replicationConfig');
          enableReplication();
} catch (error) {
          logger.warn('[DatabaseRecovery] Could not re-enable replication:', error);
        }

        // Wait a moment for cleanup to complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Force reload to reinitialize everything
        window.location.reload();
      } else {
        setRecoveryStatus('Additional steps needed. Please follow the instructions below.');
        setShowManualInstructions(true);
      }
    } catch (error) {
      logger.error('[DatabaseRecovery] Optimization error or timeout:', error);

      // If it's a timeout, provide a more direct solution
      if (error instanceof Error && error.message === 'Recovery timeout') {
        setRecoveryStatus('The optimization is taking longer than expected. Please use the manual steps below.');
      } else {
        setRecoveryStatus('Please follow these simple steps to continue.');
      }
      setShowManualInstructions(true);
    } finally {
      setIsRecovering(false);
    }
  };

  const handleManualRecovery = () => {
    setShowManualInstructions(true);
  };

  // Don't show anything if database is healthy or user dismissed
  if (!isDetecting && !isCorrupted) {
    return null;
  }

  // Don't show if user dismissed the dialog
  if (isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  // Show subtle loading indicator during detection
  if (isDetecting) {
    return (
      <div className={styles.detecting}>
        <Loader className={styles.detectingIcon} />
        <span>Preparing your workspace...</span>
      </div>
    );
  }

  // Show offline warning if database issues detected while offline
  if (isCorrupted && !isOnline) {
    return (
      <div className={styles.modal}>
        <div className={styles.overlay} />
        <div className={styles.content}>
          <div className={styles.header}>
            <WifiOff className={cn(styles.warningIcon, "!animate-none")} style={{ color: 'var(--destructive)' }} />
            <h2 className={styles.title}>Database Issue Detected</h2>
          </div>

          <div className={styles.body}>
            <p className={styles.message}>
              We've detected a database issue, but you're currently offline. To safely recover without losing your data:
            </p>

            <div className="p-[var(--token-space-xl)] bg-[var(--muted)] rounded-lg mt-[var(--token-space-xl)]">
              <ol className="ml-[var(--token-space-xl)] mb-0">
                <li className="mb-[var(--token-space-md)]">
                  Connect to WiFi or a stable internet connection
                </li>
                <li className="mb-0">
                  Return to this page and the recovery will proceed automatically
                </li>
              </ol>
            </div>

            <p className="mt-[var(--token-space-xl)] text-sm text-[var(--foreground-secondary)] mb-0">
              <strong>Your offline work is safe.</strong> We will not clear any data until you're online and can re-sync from the server.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.modal}>
      <div className={styles.overlay} onClick={handleDismiss} />
      <div className={styles.content}>
        <div className={styles.header}>
          <RefreshCw className={styles.warningIcon} />
          <h2 className={styles.title}>Optimizing Your Experience</h2>
          <button
            onClick={handleDismiss}
            aria-label="Close"
            className="ml-auto bg-transparent border-none text-2xl cursor-pointer text-[var(--foreground-secondary)] p-1 leading-none"
          >
            ×
          </button>
        </div>

        <div className={styles.body}>
          <p className={styles.message}>
            We're performing a quick optimization to ensure your data loads smoothly. This typically happens when your browser's storage needs a refresh.
          </p>

          {recoveryStatus && (
            <div className={styles.status}>
              {isRecovering && <Loader className={cn(styles.statusIcon, styles.statusIconSpinning)} />}
              {!isRecovering && recoveryStatus.includes('recovered') &&
                <CheckCircle className={cn(styles.statusIcon, styles.statusIconSuccess)} />}
              {!isRecovering && recoveryStatus.includes('failed') &&
                <AlertTriangle className={cn(styles.statusIcon, styles.statusIconError)} />}
              <span>{recoveryStatus}</span>
            </div>
          )}

          {!isRecovering && !autoRecoveryAttempted && (
            <div className={styles.actions}>
              <button
                className={styles.btnPrimary}
                onClick={handleAutoRecovery}
              >
                <RefreshCw className={styles.btnIcon} />
                Optimize Now
              </button>
              <button
                className={styles.btnSecondary}
                onClick={handleManualRecovery}
              >
                More Options
              </button>
              <button
                className={cn(styles.btnSecondary, "mt-2")}
                onClick={handleDismiss}
              >
                Not Now
              </button>
            </div>
          )}

          {showManualInstructions && (
            <div className={styles.manualInstructions}>
              <h3 className={styles.manualTitle}>Additional Options</h3>

              {/* Quick fix button for stuck situations */}
              <div className="p-4 bg-[var(--background-secondary)] rounded-[var(--token-radius-md)]">
                <p className="mb-4">
                  If the automatic optimization didn't complete, you can try a full cache clear:
                </p>
                <button
                  className={cn(styles.btnPrimary, "w-full")}
                  disabled={!isOnline}
                  onClick={async () => {
                    // CRITICAL: Never clear data when offline
                    if (!isOnline) {
                      alert('⚠️ Please connect to the internet before clearing data to prevent data loss.');
                      return;
                    }

                    if (!confirm('⚠️ This will clear all cached data and re-sync from the server. Your offline work will be preserved. Continue?')) {
                      return;
                    }

                    setRecoveryStatus('Backing up offline work...');
                    setIsRecovering(true);

                    // CRITICAL: Backup pending mutations
                    backupPendingMutations();

                    setRecoveryStatus('Clearing all data and refreshing...');

                    try {
                      // Get all databases if possible
                      let allDatabases = [
                        'myK9Q_Replication',
                        'myK9Q_OfflineCache',
                        'myK9Q_Mutations',
                        'myK9Q_entries',
                        'myK9Q_classes',
                        'myK9Q_trials',
                        'myK9Q_shows',
                        'myK9Q_announcements'
                      ];

                      // Try to get actual list of databases
                      if ('databases' in indexedDB) {
                        try {
                          const dbs = await indexedDB.databases();
                          const myK9QDbs = dbs.filter(db => db.name?.startsWith('myK9Q')).map(db => db.name!);
                          if (myK9QDbs.length > 0) {
                            allDatabases = myK9QDbs;
                          }
                        } catch {
                          // Use default list
                        }
                      }

                      // Clear all myK9Q databases
                      for (const db of allDatabases) {
                        try {
                          const deleteReq = indexedDB.deleteDatabase(db);
                          await new Promise((resolve) => {
                            deleteReq.onsuccess = resolve;
                            deleteReq.onerror = resolve;
                            deleteReq.onblocked = resolve;
                            // Force timeout after 500ms per database
                            setTimeout(resolve, 500);
                          });
} catch (_e) { /* Ignore deletion errors */ }
                      }

                      // Clear localStorage (except auth AND mutation backup)
                      Object.keys(localStorage).forEach(key => {
                        if (key.includes('myK9Q') && !key.includes('auth') && !key.includes('mutation_backup')) {
                          localStorage.removeItem(key);
                        }
                      });

                      // Clear service worker cache
                      if ('serviceWorker' in navigator) {
                        try {
                          const registrations = await navigator.serviceWorker.getRegistrations();
                          for (const registration of registrations) {
                            await registration.unregister();
                          }
                        } catch {
                          // Ignore
                        }
                      }

                      setRecoveryStatus('Restoring offline work...');

                      // CRITICAL: Restore pending mutations before reload
                      restorePendingMutations();

window.location.reload();
                    } catch (error) {
                      logger.error('Error clearing cache:', error);
                      // Reload anyway
                      window.location.reload();
                    }
                  }}
                >
                  <RefreshCw className={styles.btnIcon} />
                  {isOnline ? 'Clear All Data & Refresh' : 'Offline - Connect to Clear Data'}
                </button>
                <p className="mt-2 mb-0 text-sm text-[var(--foreground-secondary)]">
                  {isOnline
                    ? 'This will clear all cached data and re-sync from the server. Your offline work will be preserved.'
                    : '⚠️ You must be online to safely clear data without losing your work.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};