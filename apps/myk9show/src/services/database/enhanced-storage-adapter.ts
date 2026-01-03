import { StateStorage } from 'zustand/middleware';
import { del, get, getMany, setMany, clear } from 'idb-keyval';

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  version: number;
  accessCount: number;
  lastAccessed: number;
}

interface CacheConfig {
  maxSize: number;
  ttl: number; // Time to live in milliseconds
  maxAge: number; // Maximum age in milliseconds
  enableCompression: boolean;
  enableMetrics: boolean;
}

interface StorageMetrics {
  hits: number;
  misses: number;
  evictions: number;
  compressionRatio: number;
  averageAccessTime: number;
}

class EnhancedStorageAdapter implements StateStorage {
  private cache = new Map<string, CacheEntry<unknown>>();
  private config: CacheConfig;
  private metrics: StorageMetrics;
  private writeQueue = new Map<string, unknown>();
  private flushTimeout: NodeJS.Timeout | null = null;
  
  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: 100,
      ttl: 30 * 60 * 1000, // 30 minutes
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      enableCompression: true,
      enableMetrics: true,
      ...config,
    };
    
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      compressionRatio: 0,
      averageAccessTime: 0,
    };
    
    // Periodic cleanup
    setInterval(() => this.cleanup(), 5 * 60 * 1000); // Every 5 minutes
  }
  
  async getItem(key: string): Promise<string | null> {
    const startTime = performance.now();
    
    try {
      // Check cache first
      const cachedEntry = this.cache.get(key);
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
          version: 1,
          accessCount: 1,
          lastAccessed: Date.now(),
        };
        
        this.cache.set(key, entry);
        this.evictIfNecessary();
        this.updateMetrics('miss', startTime);
        return this.deserializeValue(value);
      }
      
      this.updateMetrics('miss', startTime);
      return null;
    } catch (error) {
      console.error('Enhanced storage getItem error:', error);
      return null;
    }
  }
  
  async setItem(key: string, value: string): Promise<void> {
    try {
      const serializedValue = this.serializeValue(value);
      
      // Update cache
      const entry: CacheEntry<unknown> = {
        data: serializedValue,
        timestamp: Date.now(),
        version: 1,
        accessCount: 0,
        lastAccessed: Date.now(),
      };
      
      this.cache.set(key, entry);
      this.evictIfNecessary();
      
      // Queue for batch write
      this.writeQueue.set(key, serializedValue);
      this.scheduleFlush();
      
    } catch (error) {
      console.error('Enhanced storage setItem error:', error);
    }
  }
  
  async removeItem(key: string): Promise<void> {
    try {
      this.cache.delete(key);
      this.writeQueue.delete(key);
      await del(key);
    } catch (error) {
      console.error('Enhanced storage removeItem error:', error);
    }
  }
  
  async clear(): Promise<void> {
    try {
      this.cache.clear();
      this.writeQueue.clear();
      await clear();
    } catch (error) {
      console.error('Enhanced storage clear error:', error);
    }
  }
  
  // Batch operations for better performance
  async getMany(keys: string[]): Promise<(string | null)[]> {
    const startTime = performance.now();
    
    try {
      const results: (string | null)[] = [];
      const keysToFetch: string[] = [];
      const keyIndexMap = new Map<string, number>();
      
      // Check cache first
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const cachedEntry = this.cache.get(key);
        
        if (cachedEntry && this.isValidCacheEntry(cachedEntry)) {
          cachedEntry.accessCount++;
          cachedEntry.lastAccessed = Date.now();
          results[i] = this.deserializeValue(cachedEntry.data);
          this.metrics.hits++;
        } else {
          keysToFetch.push(key);
          keyIndexMap.set(key, i);
          this.metrics.misses++;
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
              version: 1,
              accessCount: 1,
              lastAccessed: Date.now(),
            };
            
            this.cache.set(key, entry);
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
      console.error('Enhanced storage getMany error:', error);
      return keys.map(() => null);
    }
  }
  
  async setMany(entries: Array<[string, string]>): Promise<void> {
    try {
      const serializedEntries: Array<[string, unknown]> = [];
      
      for (const [key, value] of entries) {
        const serializedValue = this.serializeValue(value);
        
        // Update cache
        const entry: CacheEntry<unknown> = {
          data: serializedValue,
          timestamp: Date.now(),
          version: 1,
          accessCount: 0,
          lastAccessed: Date.now(),
        };
        
        this.cache.set(key, entry);
        serializedEntries.push([key, serializedValue]);
        
        // Queue for batch write
        this.writeQueue.set(key, serializedValue);
      }
      
      this.evictIfNecessary();
      this.scheduleFlush();
      
    } catch (error) {
      console.error('Enhanced storage setMany error:', error);
    }
  }
  
  // Cache invalidation
  invalidateCache(pattern?: string | RegExp): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }
    
    const keysToDelete: string[] = [];
    
    for (const key of this.cache.keys()) {
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
    
    keysToDelete.forEach(key => this.cache.delete(key));
  }
  
  // Cache statistics
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      metrics: { ...this.metrics },
      hitRate: this.metrics.hits / (this.metrics.hits + this.metrics.misses),
    };
  }
  
  // Preload data for better performance
  async preloadKeys(keys: string[]): Promise<void> {
    const keysToLoad = keys.filter(key => !this.cache.has(key));
    
    if (keysToLoad.length > 0) {
      await this.getMany(keysToLoad);
    }
  }
  
  private isValidCacheEntry(entry: CacheEntry<unknown>): boolean {
    const now = Date.now();
    const age = now - entry.timestamp;
    const timeSinceAccess = now - entry.lastAccessed;
    
    return age < this.config.maxAge && timeSinceAccess < this.config.ttl;
  }
  
  private evictIfNecessary(): void {
    if (this.cache.size <= this.config.maxSize) {
      return;
    }
    
    // LRU eviction with access count consideration
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
      this.metrics.evictions++;
    }
  }
  
  private cleanup(): void {
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (!this.isValidCacheEntry(entry)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key));
  }
  
  private scheduleFlush(): void {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
    }
    
    this.flushTimeout = setTimeout(() => {
      this.flush();
    }, 100); // Batch writes for 100ms
  }
  
  private async flush(): Promise<void> {
    if (this.writeQueue.size === 0) {
      return;
    }
    
    const entries = Array.from(this.writeQueue.entries());
    this.writeQueue.clear();
    
    try {
      await setMany(entries);
    } catch (error) {
      console.error('Enhanced storage flush error:', error);
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
      // Simple compression using JSON parsing and stringifying
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
    if (!this.config.enableMetrics) {
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
}

// Factory function for creating enhanced storage
export function createEnhancedStorage(config?: Partial<CacheConfig>): StateStorage {
  return new EnhancedStorageAdapter(config);
}

// Store-specific configurations
export const STORE_CACHE_CONFIGS = {
  // High-frequency stores need larger cache and shorter TTL
  userStore: {
    maxSize: 200,
    ttl: 10 * 60 * 1000, // 10 minutes
    enableCompression: true,
  },
  
  dogStore: {
    maxSize: 150,
    ttl: 15 * 60 * 1000, // 15 minutes
    enableCompression: true,
  },
  
  showStore: {
    maxSize: 100,
    ttl: 20 * 60 * 1000, // 20 minutes
    enableCompression: true,
  },
  
  // Template stores can have longer TTL since they change less frequently
  templateStore: {
    maxSize: 50,
    ttl: 60 * 60 * 1000, // 1 hour
    enableCompression: true,
  },
  
  // Search stores need fast access
  searchHistoryStore: {
    maxSize: 300,
    ttl: 5 * 60 * 1000, // 5 minutes
    enableCompression: false, // Keep uncompressed for speed
  },
  
  // Default configuration
  default: {
    maxSize: 100,
    ttl: 30 * 60 * 1000, // 30 minutes
    enableCompression: true,
  },
} as const;

// Helper function to get store-specific enhanced storage
export function getStoreEnhancedStorage(storeName: string): StateStorage {
  const config = STORE_CACHE_CONFIGS[storeName as keyof typeof STORE_CACHE_CONFIGS] || STORE_CACHE_CONFIGS.default;
  return createEnhancedStorage(config);
}