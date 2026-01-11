import { StateStorage } from 'zustand/middleware';
import { del, get, getMany, setMany, clear } from 'idb-keyval';
import { logger } from '@/services/LoggingService';

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
}

interface OptimizedCacheConfig {
  maxSize: number;
  ttl: number;
  enableCompression: boolean;
  enableMetrics: boolean;
  lazyInitialization: boolean;
}

interface StorageMetrics {
  hits: number;
  misses: number;
  evictions: number;
  averageAccessTime: number;
}

class OptimizedStorageAdapter implements StateStorage {
  private cache: Map<string, CacheEntry<unknown>> | null = null;
  private config: OptimizedCacheConfig;
  private metrics: StorageMetrics | null = null;
  private writeQueue = new Map<string, unknown>();
  private flushTimeout: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;
  
  constructor(config: Partial<OptimizedCacheConfig> = {}) {
    this.config = {
      maxSize: 100,
      ttl: 30 * 60 * 1000, // 30 minutes
      enableCompression: true,
      enableMetrics: import.meta.env.DEV, // Only in development
      lazyInitialization: true,
      ...config,
    };
    
    // Don't initialize cache and metrics immediately if lazy initialization is enabled
    if (!this.config.lazyInitialization) {
      this.initialize();
    }
  }
  
  private initialize(): void {
    if (this.isInitialized) return;
    
    this.cache = new Map();
    
    if (this.config.enableMetrics) {
      this.metrics = {
        hits: 0,
        misses: 0,
        evictions: 0,
        averageAccessTime: 0,
      };
    }
    
    // Setup periodic cleanup only if needed
    if (this.config.ttl > 0) {
      this.cleanupInterval = setInterval(() => this.cleanup(), Math.min(this.config.ttl / 6, 5 * 60 * 1000));
    }
    
    this.isInitialized = true;
  }
  
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      this.initialize();
    }
  }
  
  async getItem(key: string): Promise<string | null> {
    const startTime = this.config.enableMetrics ? performance.now() : 0;
    
    try {
      // Lazy initialization
      this.ensureInitialized();
      
      // Check cache first
      const cachedEntry = this.cache!.get(key);
      if (cachedEntry && this.isValidCacheEntry(cachedEntry)) {
        cachedEntry.accessCount++;
        cachedEntry.lastAccessed = Date.now();
        this.updateMetrics('hit', startTime);
        return this.deserializeValue(cachedEntry.data);
      }
      
      // Fetch from IndexedDB
      const value = await get(key);
      if (value !== undefined) {
        const entry: CacheEntry<unknown> = {
          data: value,
          timestamp: Date.now(),
          accessCount: 1,
          lastAccessed: Date.now(),
        };
        
        this.cache!.set(key, entry);
        this.evictIfNecessary();
        this.updateMetrics('miss', startTime);
        return this.deserializeValue(value);
      }
      
      this.updateMetrics('miss', startTime);
      return null;
    } catch (error) {
      logger.error('Optimized storage getItem error', 'storage', { key }, error as Error);
      return null;
    }
  }
  
  async setItem(key: string, value: string): Promise<void> {
    try {
      // Lazy initialization
      this.ensureInitialized();
      
      const serializedValue = this.serializeValue(value);
      
      // Update cache
      const entry: CacheEntry<unknown> = {
        data: serializedValue,
        timestamp: Date.now(),
        accessCount: 0,
        lastAccessed: Date.now(),
      };
      
      this.cache!.set(key, entry);
      this.evictIfNecessary();
      
      // Queue for batch write (improved batching)
      this.writeQueue.set(key, serializedValue);
      this.scheduleFlush();
      
    } catch (error) {
      logger.error('Optimized storage setItem error', 'storage', { key }, error as Error);
    }
  }
  
  async removeItem(key: string): Promise<void> {
    try {
      this.ensureInitialized();
      this.cache!.delete(key);
      this.writeQueue.delete(key);
      await del(key);
    } catch (error) {
      logger.error('Optimized storage removeItem error', 'storage', { key }, error as Error);
    }
  }
  
  async clear(): Promise<void> {
    try {
      this.ensureInitialized();
      this.cache!.clear();
      this.writeQueue.clear();
      await clear();
    } catch (error) {
      logger.error('Optimized storage clear error', 'storage', {}, error as Error);
    }
  }
  
  // Batch operations for better performance
  async getMany(keys: string[]): Promise<(string | null)[]> {
    const startTime = this.config.enableMetrics ? performance.now() : 0;
    
    try {
      this.ensureInitialized();
      
      const results: (string | null)[] = [];
      const keysToFetch: string[] = [];
      const keyIndexMap = new Map<string, number>();
      
      // Check cache first
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const cachedEntry = this.cache!.get(key);
        
        if (cachedEntry && this.isValidCacheEntry(cachedEntry)) {
          cachedEntry.accessCount++;
          cachedEntry.lastAccessed = Date.now();
          results[i] = this.deserializeValue(cachedEntry.data);
          if (this.metrics) this.metrics.hits++;
        } else {
          keysToFetch.push(key);
          keyIndexMap.set(key, i);
          if (this.metrics) this.metrics.misses++;
        }
      }
      
      // Fetch missing keys from IndexedDB
      if (keysToFetch.length > 0) {
        const values = await getMany(keysToFetch);
        
        for (let i = 0; i < keysToFetch.length; i++) {
          const key = keysToFetch[i];
          const value = values[i];
          const originalIndex = keyIndexMap.get(key)!;
          
          if (value !== undefined) {
            const entry: CacheEntry<unknown> = {
              data: value,
              timestamp: Date.now(),
              accessCount: 1,
              lastAccessed: Date.now(),
            };
            
            this.cache!.set(key, entry);
            results[originalIndex] = this.deserializeValue(value);
          } else {
            results[originalIndex] = null;
          }
        }
      }
      
      this.evictIfNecessary();
      this.updateMetrics('batch', startTime);
      return results;
      
    } catch (error) {
      logger.error('Optimized storage getMany error', 'storage', { keys }, error as Error);
      return keys.map(() => null);
    }
  }
  
  // Cache management methods
  invalidateCache(pattern?: string | RegExp): void {
    this.ensureInitialized();
    
    if (!pattern) {
      this.cache!.clear();
      return;
    }
    
    const keysToDelete: string[] = [];
    
    for (const key of this.cache!.keys()) {
      if (typeof pattern === 'string') {
        if (key.includes(pattern)) {
          keysToDelete.push(key);
        }
      } else if (pattern instanceof RegExp) {
        if (pattern.test(key)) {
          keysToDelete.push(key);
        }
      }
    }
    
    keysToDelete.forEach(key => this.cache!.delete(key));
  }
  
  getCacheStats() {
    this.ensureInitialized();
    
    return {
      size: this.cache!.size,
      maxSize: this.config.maxSize,
      metrics: this.metrics ? { ...this.metrics } : null,
      hitRate: this.metrics ? this.metrics.hits / (this.metrics.hits + this.metrics.misses) : 0,
      isInitialized: this.isInitialized,
    };
  }
  
  private isValidCacheEntry(entry: CacheEntry<unknown>): boolean {
    if (this.config.ttl <= 0) return true;
    
    const now = Date.now();
    const timeSinceAccess = now - entry.lastAccessed;
    
    return timeSinceAccess < this.config.ttl;
  }
  
  private evictIfNecessary(): void {
    if (!this.cache || this.cache.size <= this.config.maxSize) {
      return;
    }
    
    // Improved LRU eviction
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => {
      const [, entryA] = a;
      const [, entryB] = b;
      
      // Prioritize by access count, then by last accessed time
      if (entryA.accessCount !== entryB.accessCount) {
        return entryA.accessCount - entryB.accessCount;
      }
      
      return entryA.lastAccessed - entryB.lastAccessed;
    });
    
    const toEvict = entries.slice(0, this.cache.size - this.config.maxSize);
    
    for (const [key] of toEvict) {
      this.cache.delete(key);
      if (this.metrics) this.metrics.evictions++;
    }
  }
  
  private cleanup(): void {
    if (!this.cache) return;
    
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (!this.isValidCacheEntry(entry)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.cache!.delete(key));
  }
  
  private scheduleFlush(): void {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
    }
    
    this.flushTimeout = setTimeout(() => {
      this.flush();
    }, 50); // Reduced from 100ms to 50ms for better responsiveness
  }
  
  private async flush(): Promise<void> {
    if (this.writeQueue.size === 0) {
      return;
    }
    
    const entries = Array.from(this.writeQueue.entries());
    this.writeQueue.clear();
    
    try {
      // Use batch operations for better performance
      await setMany(entries);
    } catch (error) {
      logger.error('Optimized storage flush error', 'storage', { entriesCount: entries.length }, error as Error);
      // Re-queue failed writes
      entries.forEach(([key, value]) => {
        this.writeQueue.set(key, value);
      });
    }
  }
  
  private serializeValue(value: string): unknown {
    if (!this.config.enableCompression) {
      return value;
    }
    
    try {
      // Simple compression using JSON parsing
      const parsed = JSON.parse(value);
      return parsed;
    } catch {
      return value;
    }
  }
  
  private deserializeValue(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  
  private updateMetrics(type: 'hit' | 'miss' | 'batch', startTime: number): void {
    if (!this.config.enableMetrics || !this.metrics) {
      return;
    }
    
    const duration = performance.now() - startTime;
    
    if (type === 'hit') {
      this.metrics.hits++;
    } else if (type === 'miss') {
      this.metrics.misses++;
    }
    
    // Update average access time
    const totalAccesses = this.metrics.hits + this.metrics.misses;
    this.metrics.averageAccessTime = 
      (this.metrics.averageAccessTime * (totalAccesses - 1) + duration) / totalAccesses;
  }
  
  // Cleanup method
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
    }
    if (this.cache) {
      this.cache.clear();
    }
  }
}

// Factory function for creating optimized storage
export function createOptimizedStorage(config?: Partial<OptimizedCacheConfig>): StateStorage {
  return new OptimizedStorageAdapter(config);
}

// Store-specific configurations optimized for performance
export const OPTIMIZED_STORE_CONFIGS = {
  // Critical stores - minimal caching for fastest startup
  userStore: {
    maxSize: 50,
    ttl: 15 * 60 * 1000, // 15 minutes
    enableCompression: false, // Disable for speed
    lazyInitialization: true,
  },
  
  dogStore: {
    maxSize: 50,
    ttl: 15 * 60 * 1000,
    enableCompression: false,
    lazyInitialization: true,
  },
  
  showStore: {
    maxSize: 30,
    ttl: 20 * 60 * 1000,
    enableCompression: false,
    lazyInitialization: true,
  },
  
  clubStore: {
    maxSize: 30,
    ttl: 20 * 60 * 1000,
    enableCompression: false,
    lazyInitialization: true,
  },
  
  // Important stores - balanced performance
  entryStore: {
    maxSize: 100,
    ttl: 10 * 60 * 1000,
    enableCompression: true,
    lazyInitialization: true,
  },
  
  // Feature stores - more aggressive caching
  templateStore: {
    maxSize: 50,
    ttl: 60 * 60 * 1000, // 1 hour
    enableCompression: true,
    lazyInitialization: true,
  },
  
  // Search stores - optimized for frequent access
  searchHistoryStore: {
    maxSize: 200,
    ttl: 5 * 60 * 1000, // 5 minutes
    enableCompression: false,
    lazyInitialization: true,
  },
  
  // Default configuration
  default: {
    maxSize: 50,
    ttl: 30 * 60 * 1000,
    enableCompression: true,
    lazyInitialization: true,
  },
} as const;

// Helper function to get optimized store storage
export function getOptimizedStoreStorage(storeName: string): StateStorage {
  const config = OPTIMIZED_STORE_CONFIGS[storeName as keyof typeof OPTIMIZED_STORE_CONFIGS] || OPTIMIZED_STORE_CONFIGS.default;
  return createOptimizedStorage(config);
}