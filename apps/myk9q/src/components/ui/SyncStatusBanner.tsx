/**
 * SyncStatusBanner - Shows sync failures and data staleness warnings
 *
 * Displays:
 * - Error banner when sync fails (dismissable)
 * - Warning banner when data is stale (>2 hours old)
 * - "Last synced" timestamp
 *
 * Uses the syncStatusStore for state management.
 */

import React, { useEffect } from 'react';
import { AlertTriangle, RefreshCw, X, Clock } from 'lucide-react';
import { useSyncStatusStore, initSyncStatusListeners } from '../../stores/syncStatusStore';
import { refreshAllTables } from '../../services/replication/initReplication';
import { cn } from '../../lib/utils';

// Initialize listeners once
let listenersInitialized = false;

export interface SyncStatusBannerProps {
  /** Show last synced timestamp */
  showLastSynced?: boolean;
  /** Show staleness warning */
  showStalenessWarning?: boolean;
  /** Position: top or bottom */
  position?: 'top' | 'bottom';
}

export const SyncStatusBanner: React.FC<SyncStatusBannerProps> = ({
  showLastSynced = true,
  showStalenessWarning = true,
  position = 'top',
}) => {
  const {
    lastFailure,
    failureDismissed,
    dismissFailure,
    isDataStale,
    hasNeverSynced,
    getLastSyncedText,
    isSyncing,
    setSyncing,
  } = useSyncStatusStore();

  // Initialize event listeners on mount
  useEffect(() => {
    if (!listenersInitialized) {
      initSyncStatusListeners();
      listenersInitialized = true;
    }
  }, []);

  const handleRetry = async () => {
    setSyncing(true);
    try {
      await refreshAllTables();
    } finally {
      setSyncing(false);
    }
  };

  // IMPORTANT: Don't show sync warnings when offline
  // The OfflineIndicator already handles offline state - these banners are for
  // "online but sync is failing" scenarios (server issues, auth problems, etc.)
  const isOnline = navigator.onLine;

  const dataIsStale = isDataStale();
  const showFailureBanner = isOnline && lastFailure && !failureDismissed;
  const showStaleWarning = isOnline && showStalenessWarning && dataIsStale && !showFailureBanner;

  // Don't render anything if there's nothing to show
  if (!showFailureBanner && !showStaleWarning && !showLastSynced) {
    return null;
  }

  const bannerStyles = {
    container: cn(
      "sticky z-[100]",
      position === 'top' ? "top-0" : "bottom-0"
    ),
    banner: cn(
      "flex items-center gap-3 px-4 py-2.5",
      "rounded-lg mx-4 my-2 shadow-md",
      "transition-all duration-200"
    ),
    error: "bg-red-50 border border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
    warning: "bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200",
    action: cn(
      "flex items-center gap-1.5 px-3 py-1.5 rounded-md",
      "text-xs font-medium whitespace-nowrap",
      "bg-white/80 border border-current/20",
      "transition-all duration-150 hover:bg-white",
      "disabled:opacity-50 disabled:cursor-not-allowed"
    ),
    dismiss: cn(
      "p-1 rounded-md transition-colors duration-150",
      "hover:bg-black/5 dark:hover:bg-white/10"
    ),
  };

  return (
    <div className={bannerStyles.container}>
      {/* Sync Failure Banner */}
      {showFailureBanner && (
        <div className={cn(bannerStyles.banner, bannerStyles.error)} role="alert">
          <AlertTriangle size={18} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-medium block truncate">
              {lastFailure.message}
            </span>
            <span className="text-xs opacity-80">
              Data may be outdated. Tap retry to sync.
            </span>
          </div>
          <button
            className={bannerStyles.action}
            onClick={handleRetry}
            disabled={isSyncing}
          >
            <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
            {isSyncing ? 'Syncing...' : 'Retry'}
          </button>
          <button
            className={bannerStyles.dismiss}
            onClick={dismissFailure}
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Staleness Warning Banner */}
      {showStaleWarning && (
        <div className={cn(bannerStyles.banner, bannerStyles.warning)} role="alert">
          <Clock size={18} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-medium block">
              Data may be outdated
            </span>
            <span className="text-xs opacity-80">
              Last synced: {getLastSyncedText()}
            </span>
          </div>
          <button
            className={bannerStyles.action}
            onClick={handleRetry}
            disabled={isSyncing}
          >
            <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
            {isSyncing ? 'Syncing...' : 'Refresh'}
          </button>
        </div>
      )}

      {/* Last Synced Indicator (subtle, non-intrusive) */}
      {showLastSynced && !showFailureBanner && !showStaleWarning && (
        <div className="flex items-center gap-1.5 px-4 py-1 text-xs text-[var(--muted-foreground)]">
          <Clock size={12} />
          <span>{hasNeverSynced() ? 'Syncing...' : `Last synced: ${getLastSyncedText()}`}</span>
        </div>
      )}
    </div>
  );
};

/**
 * Compact version for headers - just shows icon + last synced time
 */
export const CompactSyncStatus: React.FC = () => {
  const { isDataStale, hasNeverSynced, getLastSyncedText, lastFailure, failureDismissed } = useSyncStatusStore();

  // Initialize event listeners
  useEffect(() => {
    if (!listenersInitialized) {
      initSyncStatusListeners();
      listenersInitialized = true;
    }
  }, []);

  const hasError = lastFailure && !failureDismissed;
  const stale = isDataStale();

  const statusStyles = cn(
    "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium",
    hasError && "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20",
    stale && !hasError && "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20",
    !hasError && !stale && "text-[var(--muted-foreground)]"
  );

  const neverSynced = hasNeverSynced();
  const titleText = neverSynced ? 'Initial sync in progress...' : `Last synced: ${getLastSyncedText()}`;

  return (
    <div className={statusStyles} title={titleText}>
      {hasError ? (
        <AlertTriangle size={14} />
      ) : stale ? (
        <Clock size={14} />
      ) : (
        <Clock size={14} />
      )}
      <span>{getLastSyncedText()}</span>
    </div>
  );
};
