/**
 * Offline Queue Store with IndexedDB Persistence
 *
 * Manages a queue of mutations (scores, check-ins, etc.) that need to be synced
 * with the server. Provides automatic retry with exponential backoff.
 *
 * Enhanced from localStorage to IndexedDB for better persistence and capacity.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { mutationQueue } from '@/services/replication/MutationQueueManager';
import { haptic } from '@myk9/scoring-ui';
import { logger } from '@/utils/logger';

export interface QueuedScore {
  id: string; // UUID for queue item
  entryId: number;
  armband: number;
  classId: number;
  className: string;
  licenseKey: string; // Required for RLS header in background sync
  scoreData: {
    resultText: string;
    searchTime?: string;
    faultCount?: number;
    points?: number;
    nonQualifyingReason?: string;
    areas?: { [key: string]: string };
    healthCheckPassed?: boolean;
    mph?: number;
    score?: number;
    deductions?: number;
    // Nationals-specific fields
    correctCount?: number;
    incorrectCount?: number;
    finishCallErrors?: number;
    // Area time fields for AKC Scent Work
    areaTimes?: string[];
    element?: string;
    level?: string;
  };
  timestamp: string;
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  status: 'pending' | 'syncing' | 'failed' | 'completed';
  // Epoch ms when this item becomes eligible for re-sync. Set by markAsFailed
  // during exponential backoff so the item stays 'pending' but is gated from
  // immediate re-selection. null/undefined = eligible now.
  retryAt?: number | null;
}

interface OfflineQueueState {
  queue: QueuedScore[];
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAttempt: string | null;
  failedItems: QueuedScore[];

  // Actions
  addToQueue: (score: Omit<QueuedScore, 'id' | 'timestamp' | 'retryCount' | 'maxRetries' | 'status'>) => Promise<void>;
  removeFromQueue: (id: string) => Promise<void>;
  updateQueueItem: (id: string, updates: Partial<QueuedScore>) => void;

  // Sync Actions
  setOnlineStatus: (isOnline: boolean) => void;
  startSync: () => void;
  syncComplete: (successIds: string[], failedIds: string[]) => void;
  retryFailed: () => void;
  clearCompleted: () => void;

  // Utilities
  getPendingCount: () => number;
  getFailedCount: () => number;
  getNextItemToSync: () => QueuedScore | null;
  /** Earliest future retryAt across pending items, or null if none waiting. */
  getNextRetryAt: () => number | null;
  markAsSyncing: (id: string) => void;
  markAsFailed: (id: string, error: string) => void;
  markAsCompleted: (id: string) => Promise<void>;
  hydrate: () => Promise<void>;
}

const BACKOFF_BASE_MS = 1000;

export const useOfflineQueueStore = create<OfflineQueueState>()(
  devtools(
    (set, get) => ({
      queue: [],
      isOnline: navigator.onLine,
      isSyncing: false,
      lastSyncAttempt: null,
      failedItems: [],

      addToQueue: async (score) => {
        const queueItem: QueuedScore = {
          ...score,
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          retryCount: 0,
          maxRetries: 3,
          status: 'pending',
          retryAt: null,
        };

        // Add to state
        set((state) => ({
          queue: [...state.queue, queueItem]
        }));

        // Persist to IndexedDB
        try {
          await mutationQueue.set({
            id: queueItem.id,
            type: 'SUBMIT_SCORE',
            data: queueItem,
            timestamp: Date.now(),
            retries: 0,
            status: 'pending',
          });

          // Register background sync (if supported) - enables sync even when app is closed
          if ('serviceWorker' in navigator && 'SyncManager' in window) {
            try {
              const registration = await navigator.serviceWorker.ready;
              await registration.sync.register('offline-queue-sync');
            } catch (syncError) {
              // Background sync not available - fall back to existing timer-based sync
              logger.warn('[OfflineQueue] Background sync registration failed:', syncError);
            }
          }
        } catch (error) {
          logger.error('❌ Failed to persist score to IndexedDB:', error);
        }

        // Haptic feedback
        haptic.light();

        // INTENT: do NOT call startSync() here. startSync only flips
        // isSyncing=true; the actual queue processing lives in
        // useOfflineQueueProcessor, whose useEffect already re-fires on the
        // queue mutation above. The only path that clears isSyncing in
        // steady-state is syncManager.processOfflineQueue (online-transition
        // only), so scheduling startSync from this hot path used to latch
        // the flag and silently wedge subsequent syncs. See test:
        // `does not leave isSyncing latched true after addToQueue while online`.
      },

      removeFromQueue: async (id) => {
        set((state) => ({
          queue: state.queue.filter(item => item.id !== id),
          failedItems: state.failedItems.filter(item => item.id !== id)
        }));

        // Remove from IndexedDB
        try {
          await mutationQueue.delete(id);
        } catch (error) {
          logger.error('❌ Failed to remove score from IndexedDB:', error);
        }
      },

      updateQueueItem: (id, updates) => {
        set((state) => ({
          queue: state.queue.map(item =>
            item.id === id ? { ...item, ...updates } : item
          )
        }));
      },

      setOnlineStatus: (isOnline) => {
        set({ isOnline });

        // Start sync when coming online
        if (isOnline && get().queue.some(item => item.status === 'pending')) {
          get().startSync();
        }
      },

      startSync: () => {
        const { isOnline, isSyncing, queue } = get();

        if (!isOnline || isSyncing || !queue.some(item => item.status === 'pending')) {
          return;
        }

        set({
          isSyncing: true,
          lastSyncAttempt: new Date().toISOString()
        });
      },

      syncComplete: (successIds, failedIds) => {
        set((state) => {
          const updatedQueue = state.queue.map(item => {
            if (successIds.includes(item.id)) {
              return { ...item, status: 'completed' as const };
            }
            if (failedIds.includes(item.id)) {
              return {
                ...item,
                status: 'failed' as const,
                retryCount: item.retryCount + 1
              };
            }
            return item;
          });

          const failedItems = updatedQueue.filter(
            item => item.status === 'failed' && item.retryCount >= item.maxRetries
          );

          return {
            queue: updatedQueue.filter(
              item => item.status !== 'completed' && !failedItems.includes(item)
            ),
            failedItems: [...state.failedItems, ...failedItems],
            isSyncing: false
          };
        });
      },

      retryFailed: () => {
        set((state) => {
          const itemsToRetry: QueuedScore[] = state.failedItems.map(item => ({
            ...item,
            status: 'pending',
            retryCount: 0,
            retryAt: null,
          }));

          return {
            queue: [...state.queue, ...itemsToRetry],
            failedItems: []
          };
        });

        // Trigger sync
        if (get().isOnline) {
          get().startSync();
        }
      },

      clearCompleted: () => {
        set((state) => ({
          queue: state.queue.filter(item => item.status !== 'completed')
        }));
      },

      getPendingCount: () => {
        return get().queue.filter(item => item.status === 'pending').length;
      },

      getFailedCount: () => {
        return get().failedItems.length;
      },

      getNextItemToSync: () => {
        const now = Date.now();
        const pending = get().queue.find(
          item =>
            item.status === 'pending' &&
            (item.retryAt == null || item.retryAt <= now)
        );
        return pending || null;
      },

      getNextRetryAt: () => {
        const now = Date.now();
        const waiting = get()
          .queue.filter(
            item =>
              item.status === 'pending' &&
              item.retryAt != null &&
              item.retryAt > now
          )
          .map(item => item.retryAt as number);
        if (waiting.length === 0) return null;
        return Math.min(...waiting);
      },

      markAsSyncing: (id) => {
        get().updateQueueItem(id, { status: 'syncing' });
      },

      markAsFailed: (id, error) => {
        set((state) => {
          const item = state.queue.find(q => q.id === id);
          if (!item) return state;

          const nextRetryCount = item.retryCount + 1;

          // Max retries reached → move to failedItems (terminal state).
          if (nextRetryCount >= item.maxRetries) {
            const terminalItem: QueuedScore = {
              ...item,
              status: 'failed',
              lastError: error,
              retryCount: nextRetryCount,
              retryAt: null,
            };
            return {
              queue: state.queue.filter(q => q.id !== id),
              failedItems: [...state.failedItems, terminalItem],
            };
          }

          // Non-terminal failure → keep item 'pending' with backoff retryAt
          // so getNextItemToSync re-selects it after the delay. Without this,
          // the previous implementation parked items in 'failed' state where
          // no selector would ever pick them up.
          // Backoff schedule with maxRetries=3: 1s after attempt 1, 2s after
          // attempt 2. (Attempt 3's failure is terminal, so 2^2*1000=4s is
          // never used; bump maxRetries to 4 if a third backoff tier is added.)
          const delayMs = Math.pow(2, item.retryCount) * BACKOFF_BASE_MS;
          const retryItem: QueuedScore = {
            ...item,
            status: 'pending',
            lastError: error,
            retryCount: nextRetryCount,
            retryAt: Date.now() + delayMs,
          };
          return {
            queue: state.queue.map(q => (q.id === id ? retryItem : q)),
          };
        });
      },

      markAsCompleted: async (id) => {
        set((state) => ({
          queue: state.queue.filter(item => item.id !== id)
        }));

        // Remove from IndexedDB
        try {
          await mutationQueue.delete(id);
          haptic.success();
        } catch (error) {
          logger.error('❌ Failed to remove completed score from IndexedDB:', error);
        }
      },

      // Hydrate queue from IndexedDB on startup
      hydrate: async () => {
        try {
          const mutations = await mutationQueue.getAll();
          const scores = mutations
            .filter(m => m.type === 'SUBMIT_SCORE')
            .map(m => m.data as QueuedScore);

          if (scores.length > 0) {
            set({ queue: scores });
            // Auto-sync if online
            if (get().isOnline) {
              setTimeout(() => get().startSync(), 1000);
            }
          }
        } catch (error) {
          logger.error('❌ Failed to hydrate offline queue:', error);
        }
      }
    }),
    { name: 'offline-queue', enabled: import.meta.env.DEV }
  )
);

// Listen for online/offline events
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useOfflineQueueStore.getState().setOnlineStatus(true);
  });

  window.addEventListener('offline', () => {
    useOfflineQueueStore.getState().setOnlineStatus(false);
  });

  // Hydrate on next tick to avoid circular dependency during minification
  // This prevents "Cannot access 'A' before initialization" errors in production
  setTimeout(() => {
    useOfflineQueueStore.getState().hydrate?.();
  }, 0);
}