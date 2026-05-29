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
  entryId: string;
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
  lastSyncAttempt: string | null;
  failedItems: QueuedScore[];

  // Actions
  addToQueue: (score: Omit<QueuedScore, 'id' | 'timestamp' | 'retryCount' | 'maxRetries' | 'status'>) => Promise<void>;
  removeFromQueue: (id: string) => Promise<void>;
  updateQueueItem: (id: string, updates: Partial<QueuedScore>) => void;

  // Sync Actions
  setOnlineStatus: (isOnline: boolean) => void;
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

        // INTENT: queue processing lives in useOfflineQueueProcessor, whose
        // effect re-fires on the queue mutation above. Do not flip a global
        // syncing flag here; per-item syncing state is the source of truth.
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
        set((state) => ({
          queue: state.queue.map(item =>
            item.id === id ? { ...item, status: 'syncing' as const } : item
          ),
          lastSyncAttempt: new Date().toISOString(),
        }));
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
            const queue = state.queue.filter(q => q.id !== id);
            return {
              queue,
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
          const queue = state.queue.map(q => (q.id === id ? retryItem : q));
          return {
            queue,
          };
        });
      },

      markAsCompleted: async (id) => {
        set((state) => {
          const queue = state.queue.filter(item => item.id !== id);
          return {
            queue,
          };
        });

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
