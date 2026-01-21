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
import { cn } from '@/lib/utils';

// Initialize listeners once
let listenersInitialized = false;

interface SyncStatusPopoverProps {
  /** Optional additional className */
  className?: string;
}

/** Tailwind styles for sync status indicator states */
const indicatorStyles = {
  base: cn(
    "relative flex items-center justify-center",
    "w-10 h-10 rounded-xl border-none cursor-pointer",
    "transition-all duration-200",
    "hover:scale-105 active:scale-95"
  ),
  error: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  offline: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  warning: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  syncing: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  pending: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  ok: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
};

/** Tailwind styles for popover components */
const popoverStyles = {
  container: "relative",
  popover: cn(
    "absolute top-full right-0 mt-2 z-50",
    "w-80 bg-[var(--card)] border border-[var(--border)]",
    "rounded-xl shadow-xl overflow-hidden",
    "animate-fade-in"
  ),
  header: cn(
    "flex items-center justify-between",
    "px-4 py-3 border-b border-[var(--border)]",
    "bg-[var(--muted)]/30"
  ),
  title: "text-sm font-semibold text-[var(--foreground)]",
  closeBtn: cn(
    "p-1 rounded-md text-[var(--muted-foreground)]",
    "hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
    "transition-colors duration-150"
  ),
  content: "p-3 space-y-2",
  row: cn(
    "flex items-center gap-3 p-2.5 rounded-lg",
    "transition-colors duration-150"
  ),
  rowError: "bg-red-50 dark:bg-red-900/20",
  rowSuccess: "bg-green-50 dark:bg-green-900/20",
  rowIcon: "flex-shrink-0 w-5 h-5 flex items-center justify-center",
  rowContent: "flex-1 min-w-0",
  rowLabel: "text-sm font-medium text-[var(--foreground)] block",
  rowDetail: "text-xs text-[var(--muted-foreground)] truncate block",
  iconOk: "text-green-500",
  iconWarning: "text-amber-500",
  iconError: "text-red-500",
  iconPending: "text-purple-500",
  iconSyncing: "text-blue-500 animate-spin",
  dismissBtn: cn(
    "p-1 rounded text-[var(--muted-foreground)]",
    "hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
    "transition-colors duration-150"
  ),
  actionSmall: cn(
    "px-2.5 py-1 rounded-md text-xs font-medium",
    "bg-[var(--primary)] text-white",
    "hover:opacity-90 transition-opacity"
  ),
  footer: cn(
    "px-4 py-3 border-t border-[var(--border)]",
    "bg-[var(--muted)]/30"
  ),
  syncBtn: cn(
    "w-full flex items-center justify-center gap-2",
    "px-4 py-2.5 rounded-lg",
    "bg-[var(--primary)] text-white font-medium text-sm",
    "hover:opacity-90 transition-opacity",
    "disabled:opacity-50 disabled:cursor-not-allowed"
  ),
  badge: cn(
    "absolute -top-1 -right-1",
    "min-w-5 h-5 px-1.5 rounded-full",
    "bg-red-500 text-white text-xs font-semibold",
    "flex items-center justify-center",
    "border-2 border-[var(--card)]"
  ),
};

/**
 * Determine the indicator style key based on sync state
 */
function getIndicatorStyleKey(
  hasSyncFailure: boolean | null,
  isOnline: boolean,
  hasStaleWarning: boolean,
  isInitialSync: boolean,
  mode: string
): keyof typeof indicatorStyles {
  if (hasSyncFailure) return 'error';
  if (!isOnline) return 'offline';
  if (hasStaleWarning) return 'warning';
  if (isInitialSync || mode === 'syncing') return 'syncing';
  if (mode === 'pending') return 'pending';
  return 'ok';
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
    return <CloudUpload size={size} strokeWidth={strokeWidth} className="animate-spin" />;
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

  // Compute indicator style and icon (using extracted helpers)
  const indicatorStyleKey = getIndicatorStyleKey(hasSyncFailure, isOnline, hasStaleWarning, isInitialSync, mode);
  const statusIcon = renderStatusIcon(hasSyncFailure, isOnline, hasStaleWarning, isInitialSync, mode, counts.pending);

  // Show badge for pending/failed counts
  const badgeCount = counts.failed > 0 ? counts.failed : counts.pending;
  const showBadge = badgeCount > 0;

  return (
    <div className={cn(popoverStyles.container, className)}>
      {/* Compact Indicator (trigger) */}
      <button
        ref={triggerRef}
        className={cn(indicatorStyles.base, indicatorStyles[indicatorStyleKey])}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Sync status"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {statusIcon}
        {showBadge && (
          <span className={popoverStyles.badge}>
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </button>

      {/* Popover */}
      {isOpen && (
        <div
          ref={popoverRef}
          className={popoverStyles.popover}
          role="dialog"
          aria-label="Sync status details"
        >
          {/* Header */}
          <div className={popoverStyles.header}>
            <span className={popoverStyles.title}>Sync Status</span>
            <button
              className={popoverStyles.closeBtn}
              onClick={() => setIsOpen(false)}
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Content */}
          <div className={popoverStyles.content}>
            {/* Connection Status */}
            <div className={popoverStyles.row}>
              <div className={popoverStyles.rowIcon}>
                {isOnline ? (
                  <Wifi size={16} className={popoverStyles.iconOk} />
                ) : (
                  <WifiOff size={16} className={popoverStyles.iconWarning} />
                )}
              </div>
              <div className={popoverStyles.rowContent}>
                <span className={popoverStyles.rowLabel}>
                  {isOnline ? 'Online' : 'Offline'}
                </span>
                {connection.type && isOnline && (
                  <span className={popoverStyles.rowDetail}>{connection.type}</span>
                )}
              </div>
              {isOnline && (
                <Check size={16} className={popoverStyles.iconOk} />
              )}
            </div>

            {/* Last Synced / Initial Sync Status */}
            <div className={popoverStyles.row}>
              <div className={popoverStyles.rowIcon}>
                {isInitialSync ? (
                  <CloudUpload size={16} className={popoverStyles.iconSyncing} />
                ) : (
                  <Clock size={16} className={hasStaleWarning ? popoverStyles.iconWarning : ''} />
                )}
              </div>
              <div className={popoverStyles.rowContent}>
                <span className={popoverStyles.rowLabel}>
                  {isInitialSync ? 'Initial sync' : 'Last synced'}
                </span>
                <span className={popoverStyles.rowDetail}>
                  {isInitialSync ? 'Downloading data...' : getLastSyncedText()}
                </span>
              </div>
              {hasStaleWarning && (
                <AlertTriangle size={16} className={popoverStyles.iconWarning} />
              )}
            </div>

            {/* Sync Failure (if any) */}
            {hasSyncFailure && (
              <div className={cn(popoverStyles.row, popoverStyles.rowError)}>
                <div className={popoverStyles.rowIcon}>
                  <AlertTriangle size={16} className={popoverStyles.iconError} />
                </div>
                <div className={popoverStyles.rowContent}>
                  <span className={popoverStyles.rowLabel}>Sync failed</span>
                  <span className={popoverStyles.rowDetail}>{lastFailure.message}</span>
                </div>
                <button
                  className={popoverStyles.dismissBtn}
                  onClick={dismissFailure}
                  aria-label="Dismiss error"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Pending Changes */}
            {counts.pending > 0 && (
              <div className={popoverStyles.row}>
                <div className={popoverStyles.rowIcon}>
                  <Cloud size={16} className={popoverStyles.iconPending} />
                </div>
                <div className={popoverStyles.rowContent}>
                  <span className={popoverStyles.rowLabel}>Pending changes</span>
                  <span className={popoverStyles.rowDetail}>
                    {counts.pending} score{counts.pending !== 1 ? 's' : ''} waiting to sync
                  </span>
                </div>
              </div>
            )}

            {/* Failed Items */}
            {counts.failed > 0 && (
              <div className={cn(popoverStyles.row, popoverStyles.rowError)}>
                <div className={popoverStyles.rowIcon}>
                  <AlertTriangle size={16} className={popoverStyles.iconError} />
                </div>
                <div className={popoverStyles.rowContent}>
                  <span className={popoverStyles.rowLabel}>Failed to sync</span>
                  <span className={popoverStyles.rowDetail}>
                    {counts.failed} score{counts.failed !== 1 ? 's' : ''} need retry
                  </span>
                </div>
                <button
                  className={popoverStyles.actionSmall}
                  onClick={retryFailed}
                >
                  Retry
                </button>
              </div>
            )}

            {/* All Good State - only show after initial sync completes */}
            {isOnline && !isInitialSync && !hasStaleWarning && !hasSyncFailure && counts.total === 0 && (
              <div className={cn(popoverStyles.row, popoverStyles.rowSuccess)}>
                <div className={popoverStyles.rowIcon}>
                  <Check size={16} className={popoverStyles.iconOk} />
                </div>
                <div className={popoverStyles.rowContent}>
                  <span className={popoverStyles.rowLabel}>All synced</span>
                  <span className={popoverStyles.rowDetail}>Data is up to date</span>
                </div>
              </div>
            )}
          </div>

          {/* Footer with Sync Button */}
          <div className={popoverStyles.footer}>
            <button
              className={popoverStyles.syncBtn}
              onClick={handleSyncNow}
              disabled={isSyncing || !isOnline}
            >
              <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SyncStatusPopover;
