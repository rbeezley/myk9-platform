/**
 * useOfflineStatus Hook
 *
 * Single source of truth for offline/sync status throughout the app.
 * Consolidates state logic previously duplicated across:
 * - OfflineIndicator (banner)
 * - CompactOfflineIndicator (icon)
 * - OfflineQueueStatus (toast)
 *
 * @example
 * const { mode, counts, isOnline, tooltipText } = useOfflineStatus();
 */

import { useEffect, useState, useMemo } from 'react';
import { useOfflineQueueStore } from '@/stores/offlineQueueStore';
import { networkDetectionService, type NetworkInfo } from '@/services/networkDetectionService';

// ============================================================================
// TYPES
// ============================================================================

export type OfflineStatusMode =
  | 'online'      // Online, all synced
  | 'offline'     // No network connection
  | 'pending'     // Online with items waiting to sync
  | 'syncing'     // Actively syncing items
  | 'failed';     // Items failed to sync

export type ConnectionQuality = 'slow' | 'medium' | 'fast' | null;

export interface OfflineStatusCounts {
  pending: number;
  syncing: number;
  failed: number;
  total: number;
}

export interface ConnectionInfo {
  quality: ConnectionQuality;
  type: string;
  effectiveType: string | null;
}

export interface OfflineStatus {
  /** Current mode (online, offline, pending, syncing, failed) */
  mode: OfflineStatusMode;
  /** Whether device is online */
  isOnline: boolean;
  /** Whether sync is in progress */
  isSyncing: boolean;
  /** Queue counts by status */
  counts: OfflineStatusCounts;
  /** Connection quality and type info */
  connection: ConnectionInfo;
  /** Human-readable tooltip text for current state */
  tooltipText: string;
  /** Retry failed items */
  retryFailed: () => void;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Determine connection quality from network info
 */
function getConnectionQuality(networkInfo: NetworkInfo): ConnectionQuality {
  const isSlowConnection =
    networkInfo.effectiveType === 'slow-2g' ||
    networkInfo.effectiveType === '2g' ||
    (networkInfo.downlink !== undefined && networkInfo.downlink < 1);

  if (isSlowConnection) return 'slow';
  if (networkInfo.effectiveType === '3g') return 'medium';
  if (
    networkInfo.effectiveType === '4g' ||
    networkInfo.connectionType === 'wifi' ||
    networkInfo.connectionType === 'ethernet'
  ) {
    return 'fast';
  }
  return null;
}

/**
 * Get human-readable connection type string
 */
function getConnectionTypeString(networkInfo: NetworkInfo): string {
  switch (networkInfo.connectionType) {
    case 'wifi':
      return 'WiFi';
    case 'cellular':
      return `Cellular ${networkInfo.effectiveType?.toUpperCase() || ''}`.trim();
    case 'ethernet':
      return 'Ethernet';
    default:
      return '';
  }
}

/**
 * Determine the current mode based on state
 */
function determineMode(
  isOnline: boolean,
  counts: OfflineStatusCounts,
  isSyncing: boolean
): OfflineStatusMode {
  // Failed takes priority - user needs to see this
  if (counts.failed > 0) return 'failed';

  // Offline mode
  if (!isOnline) return 'offline';

  // Syncing mode
  if (isSyncing || counts.syncing > 0) return 'syncing';

  // Online with pending items
  if (counts.pending > 0) return 'pending';

  // All good - online and synced
  return 'online';
}

/**
 * Generate tooltip text for the current state
 */
function getTooltipText(
  mode: OfflineStatusMode,
  counts: OfflineStatusCounts
): string {
  const pluralize = (count: number, word: string) =>
    `${count} ${word}${count !== 1 ? 's' : ''}`;

  switch (mode) {
    case 'online':
      return 'Online - All scores synced';
    case 'offline':
      return counts.pending > 0
        ? `Offline - ${pluralize(counts.pending, 'score')} queued`
        : 'Offline - Changes will sync when connected';
    case 'pending':
      return `${pluralize(counts.pending, 'score')} pending sync`;
    case 'syncing':
      return `Syncing ${pluralize(counts.syncing, 'score')}...`;
    case 'failed':
      return `${pluralize(counts.failed, 'score')} failed to sync`;
    default:
      return '';
  }
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook for offline/sync status - single source of truth
 *
 * @returns OfflineStatus object with mode, counts, connection info, and helpers
 */
export function useOfflineStatus(): OfflineStatus {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo>(
    networkDetectionService.getNetworkInfo()
  );

  const { queue, isSyncing, failedItems, retryFailed } = useOfflineQueueStore();

  // Calculate counts from queue
  const counts = useMemo<OfflineStatusCounts>(() => {
    const pending = queue.filter(q => q.status === 'pending').length;
    const syncing = queue.filter(q => q.status === 'syncing').length;
    const failed = failedItems.length;
    return {
      pending,
      syncing,
      failed,
      total: pending + syncing + failed,
    };
  }, [queue, failedItems]);

  // Listen to online/offline events
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

  // Subscribe to network info updates
  useEffect(() => {
    const unsubscribe = networkDetectionService.subscribe((info) => {
      setNetworkInfo(info);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Derive mode
  const mode = useMemo(
    () => determineMode(isOnline, counts, isSyncing),
    [isOnline, counts, isSyncing]
  );

  // Derive connection info
  const connection = useMemo<ConnectionInfo>(
    () => ({
      quality: getConnectionQuality(networkInfo),
      type: getConnectionTypeString(networkInfo),
      effectiveType: networkInfo.effectiveType,
    }),
    [networkInfo]
  );

  // Derive tooltip text
  const tooltipText = useMemo(
    () => getTooltipText(mode, counts),
    [mode, counts]
  );

  return {
    mode,
    isOnline,
    isSyncing,
    counts,
    connection,
    tooltipText,
    retryFailed,
  };
}

export default useOfflineStatus;
