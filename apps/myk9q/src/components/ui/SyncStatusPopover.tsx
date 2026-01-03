/**
 * SyncStatusPopover - Click-to-expand sync status details
 *
 * Combines the compact indicator with an expandable popover showing:
 * - Online/Offline status
 * - Last synced time
 * - Staleness warnings
 * - Sync failure details
 * - Pending offline changes
 * - "Sync Now" action button
 *
 * This provides at-a-glance status via the icon, with details on demand.
 */

import type React from 'react';
import { useState, useRef, useEffect } from 'react';
import {
  Wifi,
  WifiOff,
  Cloud,
  CloudUpload,
  AlertTriangle,
  Clock,
  RefreshCw,
  Check,
  X,
} from 'lucide-react';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useSyncStatusStore, initSyncStatusListeners } from '@/stores/syncStatusStore';
import { refreshAllTables } from '@/services/replication/initReplication';
import './shared-ui.css';

// Initialize listeners once
let listenersInitialized = false;

interface SyncStatusPopoverProps {
  /** Optional additional className */
  className?: string;
}

/**
 * Determine the indicator class based on sync state
 */
function getIndicatorClass(
  hasSyncFailure: boolean | null,
  isOnline: boolean,
  hasStaleWarning: boolean,
  isInitialSync: boolean,
  mode: string
): string {
  if (hasSyncFailure) return 'sync-popover-indicator--error';
  if (!isOnline) return 'sync-popover-indicator--offline';
  if (hasStaleWarning) return 'sync-popover-indicator--warning';
  if (isInitialSync || mode === 'syncing') return 'sync-popover-indicator--syncing';
  if (mode === 'pending') return 'sync-popover-indicator--pending';
  return 'sync-popover-indicator--ok';
}

/**
 * Render the appropriate status icon based on sync state
 */
function renderStatusIcon(
  hasSyncFailure: boolean | null,
  isOnline: boolean,
  hasStaleWarning: boolean,
  isInitialSync: boolean,
  mode: string,
  pendingCount: number
): React.ReactNode {
  const size = 18;
  const strokeWidth = 2;

  if (hasSyncFailure) {
    return <AlertTriangle size={size} strokeWidth={strokeWidth} />;
  }
  if (!isOnline) {
    return <WifiOff size={size} strokeWidth={strokeWidth} />;
  }
  if (hasStaleWarning) {
    return <Clock size={size} strokeWidth={strokeWidth} />;
  }
  if (isInitialSync || mode === 'syncing') {
    return <CloudUpload size={size} strokeWidth={strokeWidth} className="sync-popover-spinning" />;
  }
  if (mode === 'pending' || pendingCount > 0) {
    return <Cloud size={size} strokeWidth={strokeWidth} />;
  }
  return <Wifi size={size} strokeWidth={strokeWidth} />;
}

// eslint-disable-next-line complexity -- UI component with many conditional states for sync/offline/error display
export function SyncStatusPopover({ className = '' }: SyncStatusPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Offline queue status
  const { mode, isOnline, counts, connection, retryFailed } = useOfflineStatus();

  // Sync status (staleness, failures)
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

  // Initialize sync status listeners
  useEffect(() => {
    if (!listenersInitialized) {
      initSyncStatusListeners();
      listenersInitialized = true;
    }
  }, []);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await refreshAllTables();
    } finally {
      setSyncing(false);
    }
  };

  // Determine indicator state (combines offline status + sync status)
  const neverSynced = hasNeverSynced();
  const dataIsStale = isDataStale();
  const hasSyncFailure = isOnline && lastFailure && !failureDismissed;
  const hasStaleWarning = isOnline && dataIsStale;
  const isInitialSync = isOnline && neverSynced;

  // Compute indicator class and icon (using extracted helpers)
  const indicatorClass = getIndicatorClass(hasSyncFailure, isOnline, hasStaleWarning, isInitialSync, mode);
  const statusIcon = renderStatusIcon(hasSyncFailure, isOnline, hasStaleWarning, isInitialSync, mode, counts.pending);

  // Show badge for pending/failed counts
  const badgeCount = counts.failed > 0 ? counts.failed : counts.pending;
  const showBadge = badgeCount > 0;

  return (
    <div className={`sync-popover-container ${className}`}>
      {/* Compact Indicator (trigger) */}
      <button
        ref={triggerRef}
        className={`sync-popover-indicator ${indicatorClass}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Sync status"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {statusIcon}
        {showBadge && (
          <span className="sync-popover-badge">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </button>

      {/* Popover */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="sync-popover"
          role="dialog"
          aria-label="Sync status details"
        >
          {/* Header */}
          <div className="sync-popover__header">
            <span className="sync-popover__title">Sync Status</span>
            <button
              className="sync-popover__close"
              onClick={() => setIsOpen(false)}
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Content */}
          <div className="sync-popover__content">
            {/* Connection Status */}
            <div className="sync-popover__row">
              <div className="sync-popover__row-icon">
                {isOnline ? (
                  <Wifi size={16} className="sync-popover__icon--ok" />
                ) : (
                  <WifiOff size={16} className="sync-popover__icon--warning" />
                )}
              </div>
              <div className="sync-popover__row-content">
                <span className="sync-popover__row-label">
                  {isOnline ? 'Online' : 'Offline'}
                </span>
                {connection.type && isOnline && (
                  <span className="sync-popover__row-detail">{connection.type}</span>
                )}
              </div>
              {isOnline && (
                <Check size={16} className="sync-popover__icon--ok" />
              )}
            </div>

            {/* Last Synced / Initial Sync Status */}
            <div className="sync-popover__row">
              <div className="sync-popover__row-icon">
                {isInitialSync ? (
                  <CloudUpload size={16} className="sync-popover-spinning sync-popover__icon--syncing" />
                ) : (
                  <Clock size={16} className={hasStaleWarning ? 'sync-popover__icon--warning' : ''} />
                )}
              </div>
              <div className="sync-popover__row-content">
                <span className="sync-popover__row-label">
                  {isInitialSync ? 'Initial sync' : 'Last synced'}
                </span>
                <span className="sync-popover__row-detail">
                  {isInitialSync ? 'Downloading data...' : getLastSyncedText()}
                </span>
              </div>
              {hasStaleWarning && (
                <AlertTriangle size={16} className="sync-popover__icon--warning" />
              )}
            </div>

            {/* Sync Failure (if any) */}
            {hasSyncFailure && (
              <div className="sync-popover__row sync-popover__row--error">
                <div className="sync-popover__row-icon">
                  <AlertTriangle size={16} className="sync-popover__icon--error" />
                </div>
                <div className="sync-popover__row-content">
                  <span className="sync-popover__row-label">Sync failed</span>
                  <span className="sync-popover__row-detail">{lastFailure.message}</span>
                </div>
                <button
                  className="sync-popover__dismiss"
                  onClick={dismissFailure}
                  aria-label="Dismiss error"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Pending Changes */}
            {counts.pending > 0 && (
              <div className="sync-popover__row">
                <div className="sync-popover__row-icon">
                  <Cloud size={16} className="sync-popover__icon--pending" />
                </div>
                <div className="sync-popover__row-content">
                  <span className="sync-popover__row-label">Pending changes</span>
                  <span className="sync-popover__row-detail">
                    {counts.pending} score{counts.pending !== 1 ? 's' : ''} waiting to sync
                  </span>
                </div>
              </div>
            )}

            {/* Failed Items */}
            {counts.failed > 0 && (
              <div className="sync-popover__row sync-popover__row--error">
                <div className="sync-popover__row-icon">
                  <AlertTriangle size={16} className="sync-popover__icon--error" />
                </div>
                <div className="sync-popover__row-content">
                  <span className="sync-popover__row-label">Failed to sync</span>
                  <span className="sync-popover__row-detail">
                    {counts.failed} score{counts.failed !== 1 ? 's' : ''} need retry
                  </span>
                </div>
                <button
                  className="sync-popover__action-small"
                  onClick={retryFailed}
                >
                  Retry
                </button>
              </div>
            )}

            {/* All Good State - only show after initial sync completes */}
            {isOnline && !isInitialSync && !hasStaleWarning && !hasSyncFailure && counts.total === 0 && (
              <div className="sync-popover__row sync-popover__row--success">
                <div className="sync-popover__row-icon">
                  <Check size={16} className="sync-popover__icon--ok" />
                </div>
                <div className="sync-popover__row-content">
                  <span className="sync-popover__row-label">All synced</span>
                  <span className="sync-popover__row-detail">Data is up to date</span>
                </div>
              </div>
            )}
          </div>

          {/* Footer with Sync Button */}
          <div className="sync-popover__footer">
            <button
              className="sync-popover__sync-btn"
              onClick={handleSyncNow}
              disabled={isSyncing || !isOnline}
            >
              <RefreshCw size={16} className={isSyncing ? 'sync-popover-spinning' : ''} />
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SyncStatusPopover;
