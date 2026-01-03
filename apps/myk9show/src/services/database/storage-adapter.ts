// IndexedDB storage adapter for Zustand persist middleware
import { StateStorage } from 'zustand/middleware';
import { db } from './connection';

export function createIndexedDBStorage(): StateStorage {
  return {
    getItem: async (name: string): Promise<string | null> => {
      try {
        // Ensure database is opened
        await db.instance.open();
        const data = await db.instance._zustand_state.get(name);
        return data?.state || null;
      } catch (error) {
        console.error(`IndexedDB getItem error for ${name}:`, error);
        return null;
      }
    },
    
    setItem: async (name: string, value: string): Promise<void> => {
      try {
        // Ensure database is opened
        await db.instance.open();
        await db.instance._zustand_state.put({
          id: name,
          state: value,
          lastModified: new Date()
        });
      } catch (error) {
        console.error(`IndexedDB setItem error for ${name}:`, error);
        throw error;
      }
    },
    
    removeItem: async (name: string): Promise<void> => {
      try {
        // Ensure database is opened
        await db.instance.open();
        await db.instance._zustand_state.delete(name);
      } catch (error) {
        console.error(`IndexedDB removeItem error for ${name}:`, error);
        throw error;
      }
    }
  };
}

// Import optimized storage
import { createOptimizedIndexedDBStorage } from './storage-adapter-optimized';

// Hybrid storage that falls back to localStorage if IndexedDB fails
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createHybridStorage(_storeName: string): StateStorage {
  const indexedDBStorage = createOptimizedIndexedDBStorage();
  
  return {
    getItem: async (name: string): Promise<string | null> => {
      try {
        // Try IndexedDB first
        return await indexedDBStorage.getItem(name);
      } catch (error) {
        console.warn(`IndexedDB failed, falling back to localStorage for ${name}:`, error);
        // Fall back to localStorage
        return localStorage.getItem(name);
      }
    },
    
    setItem: async (name: string, value: string): Promise<void> => {
      try {
        // Try IndexedDB first
        await indexedDBStorage.setItem(name, value);
        // Also save to localStorage as backup during migration period
        localStorage.setItem(name, value);
      } catch (error) {
        console.warn(`IndexedDB failed, using localStorage for ${name}:`, error);
        // Fall back to localStorage
        localStorage.setItem(name, value);
      }
    },
    
    removeItem: async (name: string): Promise<void> => {
      try {
        await indexedDBStorage.removeItem(name);
        localStorage.removeItem(name);
      } catch (error) {
        console.warn(`IndexedDB failed, using localStorage for ${name}:`, error);
        localStorage.removeItem(name);
      }
    }
  };
}

// Feature detection for IndexedDB support
export function isIndexedDBAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  
  return !!(
    window.indexedDB &&
    window.IDBKeyRange &&
    window.IDBCursor &&
    window.IDBTransaction
  );
}

// Storage adapter that implements both StateStorage and Storage interfaces
class StorageAdapter implements StateStorage {
  private baseStorage: Storage;

  constructor(baseStorage: Storage) {
    this.baseStorage = baseStorage;
  }

  // StateStorage interface methods
  async getItem(name: string): Promise<string | null> {
    return this.baseStorage.getItem(name);
  }

  async setItem(name: string, value: string): Promise<void> {
    this.baseStorage.setItem(name, value);
  }

  async removeItem(name: string): Promise<void> {
    this.baseStorage.removeItem(name);
  }

  // Storage interface methods for compatibility
  get length(): number {
    return this.baseStorage.length;
  }

  clear(): void {
    this.baseStorage.clear();
  }

  key(index: number): string | null {
    return this.baseStorage.key(index);
  }
}

// Get appropriate storage based on availability and feature flags
export function getOptimalStorage(storeName: string): StateStorage {
  // In development mode, prefer localStorage for faster startup
  if (import.meta.env.DEV) {
    console.log(`Using localStorage for ${storeName} (development mode)`);
    return new StorageAdapter(localStorage);
  }
  
  // Check if IndexedDB is available
  if (!isIndexedDBAvailable()) {
    console.warn('IndexedDB not available, using localStorage');
    return new StorageAdapter(localStorage);
  }
  
  // Production: Use pure IndexedDB (no hybrid fallback)
  console.log(`Using pure IndexedDB storage for ${storeName}`);
  return createIndexedDBStorage();
  
  // Phase 2: Uncomment for hybrid storage with cloud sync
  /*
  // Check feature flag
  const useIndexedDB = import.meta.env.VITE_ENABLE_INDEXEDDB === 'true';
  
  if (useIndexedDB) {
    return createHybridStorage(storeName);
  }
  
  // Default to localStorage
  return new StorageAdapter(localStorage);
  */
}