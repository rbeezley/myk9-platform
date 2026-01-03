/**
 * PrefetchCacheManager - Consolidated prefetch cache using unified IndexedDB
 *
 * Part of IndexedDB consolidation (v4) - replaces the legacy myK9Q.cache store
 * with the new PREFETCH_CACHE store in the myK9Q_Replication database.
 *
 * This provides the same API as the legacy cache for backward compatibility
 * with usePrefetch hook, but stores data in the unified database.
 *
 * Benefits of consolidation:
 * - Single database = simpler cache clearing on logout/show-switch
 * - Reduced browser storage overhead
 * - Unified schema management
 */

import { databaseManager, REPLICATION_STORES } from './DatabaseManager';
import { logger } from '@/utils/logger';

/**
 * Cache entry structure (matches legacy format for compatibility)
 */
export interface PrefetchCacheEntry<T = unknown> {
  key: string;
  data: T;
  timestamp: number;
  ttl?: number; // Time to live in milliseconds
  size?: number; // Approximate size in bytes
}

/**
 * PrefetchCacheManager class
 * Provides CRUD operations for the prefetch cache store
 */
class PrefetchCacheManager {
  private readonly storeName = REPLICATION_STORES.PREFETCH_CACHE;

  /**
   * Get a cached entry by key
   * Returns null if not found or expired
   */
  async get<T>(key: string): Promise<PrefetchCacheEntry<T> | null> {
    try {
      const db = await databaseManager.getDatabase('prefetch-cache');
      const result = await db.get(this.storeName, key);

      if (!result) {
        return null;
      }

      const entry = result as PrefetchCacheEntry<T>;

      // Check TTL expiration
      if (entry.ttl) {
        const age = Date.now() - entry.timestamp;
        if (age > entry.ttl) {
          // Expired - delete and return null
          await this.delete(key);
          return null;
        }
      }

      return entry;
    } catch (error) {
      logger.error('[PrefetchCache] Get error:', error);
      return null;
    }
  }

  /**
   * Set a cache entry
   * @param key - Cache key
   * @param data - Data to cache
   * @param ttl - Time to live in milliseconds (optional)
   */
  async set<T>(key: string, data: T, ttl?: number): Promise<void> {
    try {
      const db = await databaseManager.getDatabase('prefetch-cache');

      const entry: PrefetchCacheEntry<T> = {
        key,
        data,
        timestamp: Date.now(),
        ttl,
        size: this.estimateSize(data),
      };

      await db.put(this.storeName, entry);
    } catch (error) {
      logger.error('[PrefetchCache] Set error:', error);
      throw error;
    }
  }

  /**
   * Delete a cache entry by key
   */
  async delete(key: string): Promise<void> {
    try {
      const db = await databaseManager.getDatabase('prefetch-cache');
      await db.delete(this.storeName, key);
    } catch (error) {
      logger.error('[PrefetchCache] Delete error:', error);
    }
  }

  /**
   * Get all cache entries (filters out expired entries)
   */
  async getAll(): Promise<PrefetchCacheEntry[]> {
    try {
      const db = await databaseManager.getDatabase('prefetch-cache');
      const results = await db.getAll(this.storeName);
      const now = Date.now();
      const validResults: PrefetchCacheEntry[] = [];

      for (const entry of results as PrefetchCacheEntry[]) {
        if (entry.ttl) {
          const age = now - entry.timestamp;
          if (age > entry.ttl) {
            // Delete expired entry (fire and forget)
            this.delete(entry.key).catch(() => {});
            continue;
          }
        }
        validResults.push(entry);
      }

      return validResults;
    } catch (error) {
      logger.error('[PrefetchCache] GetAll error:', error);
      return [];
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    try {
      const db = await databaseManager.getDatabase('prefetch-cache');
      await db.clear(this.storeName);
      logger.log('[PrefetchCache] Cache cleared');
    } catch (error) {
      logger.error('[PrefetchCache] Clear error:', error);
    }
  }

  /**
   * Clean up expired cache entries
   * @returns Number of entries deleted
   */
  async cleanExpired(): Promise<number> {
    try {
      const entries = await this.getAll(); // This already filters expired
      const db = await databaseManager.getDatabase('prefetch-cache');
      const allEntries = await db.getAll(this.storeName);

      // Count how many were filtered out (expired)
      const expiredCount = allEntries.length - entries.length;

      if (expiredCount > 0) {
        logger.log(`[PrefetchCache] Cleaned ${expiredCount} expired entries`);
      }

      return expiredCount;
    } catch (error) {
      logger.error('[PrefetchCache] CleanExpired error:', error);
      return 0;
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    entryCount: number;
    totalSize: number;
  }> {
    try {
      const entries = await this.getAll();
      const totalSize = entries.reduce((sum, entry) => sum + (entry.size || 0), 0);

      return {
        entryCount: entries.length,
        totalSize,
      };
    } catch (error) {
      logger.error('[PrefetchCache] GetStats error:', error);
      return { entryCount: 0, totalSize: 0 };
    }
  }

  /**
   * Estimate size of data in bytes (rough approximation)
   */
  private estimateSize(data: unknown): number {
    try {
      const str = JSON.stringify(data);
      return new Blob([str]).size;
    } catch {
      return 0;
    }
  }
}

/**
 * Singleton instance
 */
export const prefetchCacheManager = new PrefetchCacheManager();

/**
 * Convenience API matching legacy cache interface
 * This allows usePrefetch to switch with minimal code changes
 */
export const prefetchCache = {
  get: <T>(key: string) => prefetchCacheManager.get<T>(key),
  set: <T>(key: string, data: T, ttl?: number) => prefetchCacheManager.set(key, data, ttl),
  delete: (key: string) => prefetchCacheManager.delete(key),
  getAll: () => prefetchCacheManager.getAll(),
  clear: () => prefetchCacheManager.clear(),
};
