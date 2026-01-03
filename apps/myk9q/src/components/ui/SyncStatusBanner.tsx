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
import './shared-ui.css';

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

  return (
    <div className={`sync-status-banner-container ${position}`}>
      {/* Sync Failure Banner */}
      {showFailureBanner && (
        <div className="sync-status-banner sync-status-banner--error" role="alert">
          <AlertTriangle size={18} className="sync-status-banner__icon" />
          <div className="sync-status-banner__content">
            <span className="sync-status-banner__message">
              {lastFailure.message}
            </span>
            <span className="sync-status-banner__details">
              Data may be outdated. Tap retry to sync.
            </span>
          </div>
          <button
            className="sync-status-banner__action"
            onClick={handleRetry}
            disabled={isSyncing}
          >
            <RefreshCw size={16} className={isSyncing ? 'spinning' : ''} />
            {isSyncing ? 'Syncing...' : 'Retry'}
          </button>
          <button
            className="sync-status-banner__dismiss"
            onClick={dismissFailure}
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Staleness Warning Banner */}
      {showStaleWarning && (
        <div className="sync-status-banner sync-status-banner--warning" role="alert">
          <Clock size={18} className="sync-status-banner__icon" />
          <div className="sync-status-banner__content">
            <span className="sync-status-banner__message">
              Data may be outdated
            </span>
            <span className="sync-status-banner__details">
              Last synced: {getLastSyncedText()}
            </span>
          </div>
          <button
            className="sync-status-banner__action"
            onClick={handleRetry}
            disabled={isSyncing}
          >
            <RefreshCw size={16} className={isSyncing ? 'spinning' : ''} />
            {isSyncing ? 'Syncing...' : 'Refresh'}
          </button>
        </div>
      )}

      {/* Last Synced Indicator (subtle, non-intrusive) */}
      {showLastSynced && !showFailureBanner && !showStaleWarning && (
        <div className="sync-status-last-synced">
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

  const getStatusClass = () => {
    if (hasError) return 'compact-sync-status--error';
    if (stale) return 'compact-sync-status--warning';
    return 'compact-sync-status--ok';
  };

  const neverSynced = hasNeverSynced();
  const titleText = neverSynced ? 'Initial sync in progress...' : `Last synced: ${getLastSyncedText()}`;

  return (
    <div className={`compact-sync-status ${getStatusClass()}`} title={titleText}>
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
