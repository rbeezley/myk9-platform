/**
 * Sync Status Store
 *
 * Tracks replication sync status for UI display:
 * - Last successful sync timestamp
 * - Sync failures and error messages
 * - Data staleness warnings
 * - Pending mutation count (non-score changes)
 *
 * Listens to replication events and updates state accordingly.
 */

import { create } from 'zustand';
import { openDB } from 'idb';
import { DB_NAME, DB_VERSION } from '@/services/replication/replicationConstants';
import { REPLICATION_STORES } from '@/services/replication/DatabaseManager';
import { logger } from '@/utils/logger';

export interface SyncStatusState {
  /** Last successful sync timestamp */
  lastSyncAt: number | null;
  /** Whether sync is currently in progress */
  isSyncing: boolean;
  /** Last sync failure (null if last sync succeeded) */
  lastFailure: {
    timestamp: number;
    message: string;
    failedTables: string[];
  } | null;
  /** Whether user has dismissed the failure banner */
  failureDismissed: boolean;
  /** Staleness threshold in hours (default 2 hours) */
  stalenessThresholdHours: number;
}

export interface SyncStatusActions {
  /** Record a successful sync */
  recordSyncSuccess: (timestamp: number) => void;
  /** Record a sync failure */
  recordSyncFailure: (message: string, failedTables: string[]) => void;
  /** Dismiss the failure banner */
  dismissFailure: () => void;
  /** Check if data is stale (older than threshold) - returns false if never synced */
  isDataStale: () => boolean;
  /** Check if we've never synced (initial load state) */
  hasNeverSynced: () => boolean;
  /** Get formatted "last synced" string */
  getLastSyncedText: () => string;
  /** Set syncing state */
  setSyncing: (isSyncing: boolean) => void;
}

export type SyncStatusStore = SyncStatusState & SyncStatusActions;

// Debounce timer for failure display (prevents flashing during initial sync)
let failureDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const FAILURE_DEBOUNCE_MS = 3000; // Wait 3 seconds before showing failure

export const useSyncStatusStore = create<SyncStatusStore>((set, get) => ({
  // Initial state
  lastSyncAt: null,
  isSyncing: false,
  lastFailure: null,
  failureDismissed: false,
  stalenessThresholdHours: 2,

  // Actions
  recordSyncSuccess: (timestamp: number) => {
    // Cancel any pending failure display - sync succeeded!
    if (failureDebounceTimer) {
      clearTimeout(failureDebounceTimer);
      failureDebounceTimer = null;
    }
    set({
      lastSyncAt: timestamp,
      lastFailure: null,
      failureDismissed: false,
    });
  },

  recordSyncFailure: (message: string, failedTables: string[]) => {
    // Debounce failure display to avoid flashing during initial sync
    // If sync succeeds within 3 seconds, user never sees the error
    if (failureDebounceTimer) {
      clearTimeout(failureDebounceTimer);
    }

    failureDebounceTimer = setTimeout(() => {
      failureDebounceTimer = null;
      // Only show failure if we still don't have a recent successful sync
      const { lastSyncAt } = get();
      const hasRecentSuccess = lastSyncAt && (Date.now() - lastSyncAt) < 5000;

      if (!hasRecentSuccess) {
        set({
          lastFailure: {
            timestamp: Date.now(),
            message,
            failedTables,
          },
          failureDismissed: false,
        });
      }
    }, FAILURE_DEBOUNCE_MS);
  },

  dismissFailure: () => {
    set({ failureDismissed: true });
  },

  setSyncing: (isSyncing: boolean) => {
    set({ isSyncing });
  },

  isDataStale: () => {
    const { lastSyncAt, stalenessThresholdHours } = get();
    // IMPORTANT: Never synced is NOT the same as stale
    // "Never synced" = initial load, data is being downloaded
    // "Stale" = we HAD data but it's old now
    // Only show stale warning when we've synced before and it's been too long
    if (!lastSyncAt) return false; // Never synced - not stale, just loading
    const thresholdMs = stalenessThresholdHours * 60 * 60 * 1000;
    return Date.now() - lastSyncAt > thresholdMs;
  },

  hasNeverSynced: () => {
    const { lastSyncAt } = get();
    return lastSyncAt === null;
  },

  getLastSyncedText: () => {
    const { lastSyncAt } = get();
    if (!lastSyncAt) return 'Syncing...';

    const now = Date.now();
    const diffMs = now - lastSyncAt;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);

    if (diffSeconds < 60) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return new Date(lastSyncAt).toLocaleDateString();
  },
}));

// Track if listeners have been initialized (prevents duplicate event handlers)
let listenersInitialized = false;

/**
 * Initialize sync status listeners
 * Call this once at app startup to connect to replication events
 * Safe to call multiple times - will only register listeners once
 */
export function initSyncStatusListeners(): void {
  // Prevent duplicate event listener registration
  if (listenersInitialized) {
    return;
  }
  listenersInitialized = true;

  // Listen for sync success
  window.addEventListener('replication:sync-success', ((event: CustomEvent) => {
    const { timestamp } = event.detail;
    useSyncStatusStore.getState().recordSyncSuccess(timestamp);
  }) as EventListener);

  // Listen for sync failure
  window.addEventListener('replication:sync-failed', ((event: CustomEvent) => {
    const { message, failedTables } = event.detail;
    useSyncStatusStore.getState().recordSyncFailure(message, failedTables);
  }) as EventListener);

  // Listen for sync queued (optional - could show "syncing" state)
  window.addEventListener('replication:sync-queued', (() => {
    useSyncStatusStore.getState().setSyncing(true);
  }) as EventListener);
}

/**
 * Get count of pending mutations from IndexedDB
 * These are non-score changes (class status updates, etc.) that haven't synced yet.
 *
 * @returns Promise<number> Count of pending mutations, or 0 if database unavailable
 */
export async function getPendingMutationCount(): Promise<number> {
  try {
    const db = await openDB(DB_NAME, DB_VERSION);
    const count = await db.count(REPLICATION_STORES.PENDING_MUTATIONS);
    db.close();
    return count;
  } catch (error) {
    // Database may not exist yet or could be in use
    logger.warn('[SyncStatus] Could not read pending mutations:', error);
    return 0;
  }
}

/**
 * Get total count of all pending changes (scores + mutations)
 * Use this for logout blocking to ensure no data is lost.
 *
 * @param offlineScoreCount - Count from offlineQueueStore.getPendingCount()
 * @returns Promise<{ total: number, scores: number, mutations: number }>
 */
export async function getTotalPendingChanges(offlineScoreCount: number): Promise<{
  total: number;
  scores: number;
  mutations: number;
}> {
  const mutations = await getPendingMutationCount();
  return {
    total: offlineScoreCount + mutations,
    scores: offlineScoreCount,
    mutations,
  };
}
