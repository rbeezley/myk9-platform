/**
 * MutationQueueManager - Consolidated offline mutation queue using unified IndexedDB
 *
 * Part of IndexedDB consolidation (v5) - replaces the legacy myK9Q.mutations store
 * with the new OFFLINE_QUEUE store in the myK9Q_Replication database.
 *
 * This provides the same API as the legacy mutations store for backward compatibility
 * with offlineQueueStore, but stores data in the unified database.
 *
 * Benefits of consolidation:
 * - Single database = simpler cache clearing on logout/show-switch
 * - Reduced browser storage overhead
 * - Unified schema management
 */

import { databaseManager, REPLICATION_STORES } from './DatabaseManager';
import { logger } from '@/utils/logger';

/**
 * Mutation entry structure (matches legacy format for compatibility)
 */
export interface MutationEntry {
  id: string;
  type: 'UPDATE_STATUS' | 'SUBMIT_SCORE' | 'RESET_SCORE' | 'UPDATE_ENTRY';
  data: unknown;
  timestamp: number;
  retries: number;
  error?: string;
  status: 'pending' | 'syncing' | 'failed' | 'success';
}

/**
 * MutationQueueManager class
 * Provides CRUD operations for the offline queue store
 */
class MutationQueueManager {
  private readonly storeName = REPLICATION_STORES.OFFLINE_QUEUE;

  /**
   * Get a mutation entry by ID
   */
  async get(id: string): Promise<MutationEntry | null> {
    try {
      const db = await databaseManager.getDatabase('mutation-queue');
      const result = await db.get(this.storeName, id);
      return result as MutationEntry | null;
    } catch (error) {
      logger.error('[MutationQueue] Get error:', error);
      return null;
    }
  }

  /**
   * Set (create/update) a mutation entry
   */
  async set(mutation: MutationEntry): Promise<void> {
    try {
      const db = await databaseManager.getDatabase('mutation-queue');
      await db.put(this.storeName, mutation);
    } catch (error) {
      logger.error('[MutationQueue] Set error:', error);
      throw error;
    }
  }

  /**
   * Delete a mutation entry by ID
   */
  async delete(id: string): Promise<void> {
    try {
      const db = await databaseManager.getDatabase('mutation-queue');
      await db.delete(this.storeName, id);
    } catch (error) {
      logger.error('[MutationQueue] Delete error:', error);
    }
  }

  /**
   * Get all mutation entries
   */
  async getAll(): Promise<MutationEntry[]> {
    try {
      const db = await databaseManager.getDatabase('mutation-queue');
      const results = await db.getAll(this.storeName);
      return results as MutationEntry[];
    } catch (error) {
      logger.error('[MutationQueue] GetAll error:', error);
      return [];
    }
  }

  /**
   * Get all pending mutations
   */
  async getPending(): Promise<MutationEntry[]> {
    try {
      const db = await databaseManager.getDatabase('mutation-queue');
      const tx = db.transaction(this.storeName, 'readonly');
      const index = tx.store.index('status');
      const results = await index.getAll('pending');
      await tx.done;
      return results as MutationEntry[];
    } catch (error) {
      logger.error('[MutationQueue] GetPending error:', error);
      return [];
    }
  }

  /**
   * Clear all mutation entries
   */
  async clear(): Promise<void> {
    try {
      const db = await databaseManager.getDatabase('mutation-queue');
      await db.clear(this.storeName);
      logger.log('[MutationQueue] Queue cleared');
    } catch (error) {
      logger.error('[MutationQueue] Clear error:', error);
    }
  }
}

/**
 * Singleton instance
 */
export const mutationQueueManager = new MutationQueueManager();

/**
 * Convenience API matching legacy mutations interface
 * This allows offlineQueueStore to switch with minimal code changes
 */
export const mutationQueue = {
  get: (id: string) => mutationQueueManager.get(id),
  set: (mutation: MutationEntry) => mutationQueueManager.set(mutation),
  delete: (id: string) => mutationQueueManager.delete(id),
  getAll: () => mutationQueueManager.getAll(),
  getPending: () => mutationQueueManager.getPending(),
  clear: () => mutationQueueManager.clear(),
};
