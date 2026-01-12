/**
 * Development Storage Adapter
 * 
 * A simplified storage adapter for development that bypasses complex IndexedDB operations
 * and uses in-memory storage with optional localStorage fallback for better performance
 * during development with empty/minimal data.
 * 
 * Performance Benefits:
 * - No IndexedDB initialization overhead
 * - No connection pooling complexity
 * - Instant read/write operations
 * - Automatic fallback to localStorage for persistence
 */

import { StateStorage } from 'zustand/middleware';
import { logger } from '@/services/LoggingService';

interface DevStorageOptions {
  /**
   * Whether to persist data to localStorage for development persistence
   * @default true
   */
  useLocalStoragePersistence?: boolean;
  
  /**
   * Whether to log storage operations for debugging
   * @default false
   */
  enableLogging?: boolean;
  
  /**
   * Maximum size in MB before switching to localStorage only
   * @default 5
   */
  maxMemoryMB?: number;
}

class DevelopmentStorageAdapter {
  private memoryStore = new Map<string, string>();
  private readonly options: Required<DevStorageOptions>;
  private memoryUsageBytes = 0;
  
  constructor(options: DevStorageOptions = {}) {
    this.options = {
      useLocalStoragePersistence: options.useLocalStoragePersistence ?? true,
      enableLogging: options.enableLogging ?? false,
      maxMemoryMB: options.maxMemoryMB ?? 5,
    };
    
    if (this.options.enableLogging) {
      logger.debug('🔧 Development Storage Adapter initialized with options:', 'database', { data: this.options });
    }
  }

  private log(operation: string, key: string, details?: unknown) {
    if (this.options.enableLogging) {
      logger.debug(`🔧 DevStorage ${operation}:`, 'database', { data: key, details || '' });
    }
  }

  private updateMemoryUsage(key: string, value: string | null, isAdd: boolean) {
    const keyBytes = new TextEncoder().encode(key).length;
    const valueBytes = value ? new TextEncoder().encode(value).length : 0;
    const totalBytes = keyBytes + valueBytes;
    
    if (isAdd) {
      this.memoryUsageBytes += totalBytes;
    } else {
      this.memoryUsageBytes -= totalBytes;
    }
  }

  private shouldUseMemory(): boolean {
    const maxBytes = this.options.maxMemoryMB * 1024 * 1024;
    return this.memoryUsageBytes < maxBytes;
  }

  getItem = async (name: string): Promise<string | null> => {
    try {
      // Check memory store first (fastest)
      if (this.memoryStore.has(name)) {
        const value = this.memoryStore.get(name) || null;
        this.log('GET (memory)', name, `${value?.length || 0} chars`);
        return value;
      }
      
      // Fall back to localStorage if persistence is enabled
      if (this.options.useLocalStoragePersistence) {
        const value = localStorage.getItem(`dev_${name}`);
        this.log('GET (localStorage)', name, `${value?.length || 0} chars`);
        
        // Cache in memory for future access if under memory limit
        if (value && this.shouldUseMemory()) {
          this.memoryStore.set(name, value);
          this.updateMemoryUsage(name, value, true);
        }
        
        return value;
      }
      
      this.log('GET (miss)', name);
      return null;
    } catch (error) {
      logger.error(`Development storage getItem error for ${name}:`, 'database', {}, error as Error);
      return null;
    }
  };

  setItem = async (name: string, value: string): Promise<void> => {
    try {
      // Always store in memory if under limit
      if (this.shouldUseMemory()) {
        const hadValue = this.memoryStore.has(name);
        const oldValue = hadValue ? this.memoryStore.get(name) : null;
        
        // Update memory usage calculation
        if (hadValue && oldValue) {
          this.updateMemoryUsage(name, oldValue, false);
        }
        this.updateMemoryUsage(name, value, true);
        
        this.memoryStore.set(name, value);
        this.log('SET (memory)', name, `${value.length} chars`);
      }
      
      // Persist to localStorage if enabled
      if (this.options.useLocalStoragePersistence) {
        localStorage.setItem(`dev_${name}`, value);
        this.log('SET (localStorage)', name, `${value.length} chars`);
      }
    } catch (error) {
      logger.error(`Development storage setItem error for ${name}:`, 'database', {}, error as Error);
      throw error;
    }
  };

  removeItem = async (name: string): Promise<void> => {
    try {
      // Remove from memory
      if (this.memoryStore.has(name)) {
        const value = this.memoryStore.get(name);
        if (value) {
          this.updateMemoryUsage(name, value, false);
        }
        this.memoryStore.delete(name);
        this.log('REMOVE (memory)', name);
      }
      
      // Remove from localStorage if persistence is enabled
      if (this.options.useLocalStoragePersistence) {
        localStorage.removeItem(`dev_${name}`);
        this.log('REMOVE (localStorage)', name);
      }
    } catch (error) {
      logger.error(`Development storage removeItem error for ${name}:`, 'database', {}, error as Error);
      throw error;
    }
  };

  /**
   * Clear all development storage data
   */
  clear = async (): Promise<void> => {
    this.memoryStore.clear();
    this.memoryUsageBytes = 0;
    
    if (this.options.useLocalStoragePersistence) {
      // Remove all dev_ prefixed items
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('dev_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    }
    
    this.log('CLEAR', 'all', 'Storage cleared');
  };

  /**
   * Get memory usage statistics
   */
  getStats = () => {
    return {
      memoryEntries: this.memoryStore.size,
      memoryUsageMB: (this.memoryUsageBytes / 1024 / 1024).toFixed(2),
      maxMemoryMB: this.options.maxMemoryMB,
      isMemoryFull: !this.shouldUseMemory(),
    };
  };
}

/**
 * Create development storage adapter with optimizations for development workflow
 */
export function createDevelopmentStorage(options?: DevStorageOptions): StateStorage {
  const adapter = new DevelopmentStorageAdapter(options);
  
  // Add global access for debugging in development
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__devStorage = {
      clear: adapter.clear,
      stats: adapter.getStats,
      adapter,
    };
  }
  
  return {
    getItem: adapter.getItem,
    setItem: adapter.setItem,
    removeItem: adapter.removeItem,
  };
}

/**
 * Quick development storage for minimal overhead
 */
export function createQuickDevStorage(): StateStorage {
  return createDevelopmentStorage({
    useLocalStoragePersistence: false,
    enableLogging: false,
    maxMemoryMB: 10,
  });
}

/**
 * Development storage with persistence and logging
 */
export function createDebugDevStorage(): StateStorage {
  return createDevelopmentStorage({
    useLocalStoragePersistence: true,
    enableLogging: true,
    maxMemoryMB: 5,
  });
}