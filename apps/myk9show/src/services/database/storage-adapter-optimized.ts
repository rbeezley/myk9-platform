// Optimized IndexedDB storage adapter for Zustand persist middleware
import { StateStorage } from 'zustand/middleware';
import { db } from './connection';

// Simplified cache with longer TTL to reduce database hits
const stateCache = new Map<string, { data: string; timestamp: number }>();
const CACHE_TTL = 30000; // 30 seconds cache TTL for better performance

// Track if database is already open
let dbOpenPromise: Promise<void> | null = null;

async function ensureDbOpen(): Promise<void> {
  if (!dbOpenPromise) {
    dbOpenPromise = db.instance.open().then(() => {}).catch(error => {
      dbOpenPromise = null; // Reset on error
      throw error;
    });
  }
  return dbOpenPromise;
}

export function createOptimizedIndexedDBStorage(): StateStorage {
  return {
    getItem: async (name: string): Promise<string | null> => {
      try {
        // Check cache first
        const cached = stateCache.get(name);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
          return cached.data;
        }

        // Ensure database is opened (reuses existing connection)
        await ensureDbOpen();
        
        // Use direct table access for better performance
        const data = await db.instance._zustand_state.get(name);
        
        if (data?.state) {
          // Update cache
          stateCache.set(name, {
            data: data.state,
            timestamp: Date.now()
          });
          return data.state;
        }
        
        return null;
      } catch (error) {
        console.error(`IndexedDB getItem error for ${name}:`, error);
        return null;
      }
    },
    
    setItem: async (name: string, value: string): Promise<void> => {
      try {
        // Update cache immediately
        stateCache.set(name, {
          data: value,
          timestamp: Date.now()
        });

        // Ensure database is opened
        await ensureDbOpen();
        
        // Use put for upsert behavior
        await db.instance._zustand_state.put({
          id: name,
          state: value,
          lastModified: new Date()
        });
      } catch (error) {
        console.error(`IndexedDB setItem error for ${name}:`, error);
        // Remove from cache on error
        stateCache.delete(name);
        throw error;
      }
    },
    
    removeItem: async (name: string): Promise<void> => {
      try {
        // Remove from cache
        stateCache.delete(name);

        // Ensure database is opened
        await ensureDbOpen();
        
        await db.instance._zustand_state.delete(name);
      } catch (error) {
        console.error(`IndexedDB removeItem error for ${name}:`, error);
        throw error;
      }
    }
  };
}

// Batch read optimization for initial hydration
export async function batchReadStates(storeNames: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  
  try {
    await ensureDbOpen();
    
    // Use Dexie's transaction API correctly
    const table = db.instance._zustand_state;
    
    // Fetch all states in parallel
    const promises = storeNames.map(async (name) => {
      try {
        const data = await table.get(name);
        if (data?.state) {
          results.set(name, data.state);
          // Update cache
          stateCache.set(name, {
            data: data.state,
            timestamp: Date.now()
          });
        }
      } catch (error) {
        console.warn(`Failed to read state for ${name}:`, error);
      }
    });
    
    await Promise.all(promises);
  } catch (error) {
    console.error('Batch read failed:', error);
  }
  
  return results;
}

// Clear cache utility
export function clearStateCache(): void {
  stateCache.clear();
}

// Preload critical stores on app startup
export async function preloadCriticalStores(): Promise<void> {
  const criticalStores = [
    'myk9show-user-storage',
    'myk9show-dogs-storage',
    'myk9show-shows-storage',
    'club-store-v2'
  ];
  
  await batchReadStates(criticalStores);
}