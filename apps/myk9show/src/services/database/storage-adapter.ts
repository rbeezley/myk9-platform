// IndexedDB storage adapter for Zustand persist middleware
import { StateStorage } from 'zustand/middleware';
import { db } from './connection';
import { logger } from '@/services/LoggingService';

export function createIndexedDBStorage(): StateStorage {
  return {
    getItem: async (name: string): Promise<string | null> => {
      try {
        // Ensure database is opened
        await db.instance.open();
        const data = await db.instance._zustand_state.get(name);
        return data?.state || null;
      } catch (error) {
        logger.error('IndexedDB getItem error', 'storage', { name }, error as Error);
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
          lastModified: new Date(),
        });
      } catch (error) {
        logger.error('IndexedDB setItem error', 'storage', { name }, error as Error);
        throw error;
      }
    },

    removeItem: async (name: string): Promise<void> => {
      try {
        // Ensure database is opened
        await db.instance.open();
        await db.instance._zustand_state.delete(name);
      } catch (error) {
        logger.error('IndexedDB removeItem error', 'storage', { name }, error as Error);
        throw error;
      }
    },
  };
}

// Feature detection for IndexedDB support
export function isIndexedDBAvailable(): boolean {
  if (typeof window === 'undefined') return false;

  return !!(window.indexedDB && window.IDBKeyRange && window.IDBCursor && window.IDBTransaction);
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
    logger.debug('Using localStorage (development mode)', 'storage', { storeName });
    return new StorageAdapter(localStorage);
  }

  // Check if IndexedDB is available
  if (!isIndexedDBAvailable()) {
    logger.warn('IndexedDB not available, using localStorage', 'storage');
    return new StorageAdapter(localStorage);
  }

  logger.debug('Using pure IndexedDB storage', 'storage', { storeName });
  return createIndexedDBStorage();
}
