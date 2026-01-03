import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getOptimalStorage } from '@/services/database/storage-adapter';

interface SyncOperation {
  id: string;
  status: string;
  timestamp: Date;
  entityType?: string;
  operation?: string;
  data?: Record<string, unknown>;
}

interface SyncConflict {
  id: string;
  type: string;
  entityId: string;
  timestamp: Date;
  details?: Record<string, unknown>;
}

interface SyncSettings {
  autoSync: boolean;
  syncInterval: number;
  batchSize: number;
  retryAttempts: number;
  [key: string]: unknown;
}

interface SyncStats {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  lastSyncDuration: number;
  averageSyncTime: number;
  totalSynced: number;
  totalRecords: number;
  syncTrend: number;
  successRate: number;
  successTrend: number;
  conflicts: number;
  conflictTrend: number;
  lastSync: string | null;
  [key: string]: unknown;
}

export interface SyncState {
  // Sync statistics
  syncOperations: SyncOperation[];
  pendingOperations: SyncOperation[];
  failedOperations: SyncOperation[];
  operations: SyncOperation[];
  syncStats: SyncStats;
  
  // Network status
  isOnline: boolean;
  networkQuality: 'good' | 'poor' | 'offline';
  
  // Sync status
  isSyncing: boolean;
  lastSyncAt: Date | null;
  
  // Conflicts
  conflicts: SyncConflict[];
  
  // Settings
  syncSettings: SyncSettings;
  updateSyncSettings: (settings: Partial<SyncSettings>) => void;
  pauseAllSync: () => void;
  resumeAllSync: () => void;
  forceFullSync: () => void;
  
  // Actions
  addOperation: (operation: SyncOperation) => void;
  removeOperation: (id: string) => void;
  updateOperationStatus: (id: string, status: string) => void;
  clearOperations: () => void;
  setNetworkStatus: (online: boolean, quality?: string) => void;
  setSyncStatus: (syncing: boolean) => void;
  addConflict: (conflict: SyncConflict) => void;
  removeConflict: (id: string) => void;
}

export const useSyncStore = create<SyncState>()(
  persist(
    (set, get) => ({
      // Initial state
      syncOperations: [],
      pendingOperations: [],
      failedOperations: [],
      operations: [],
      syncStats: {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        lastSyncDuration: 0,
        averageSyncTime: 0,
        totalSynced: 0,
        totalRecords: 0,
        syncTrend: 0,
        successRate: 100,
        successTrend: 0,
        conflicts: 0,
        conflictTrend: 0,
        lastSync: null
      },
      isOnline: true,
      networkQuality: 'good',
      isSyncing: false,
      lastSyncAt: null,
      conflicts: [],
      syncSettings: {
        autoSync: true,
        syncInterval: 30000,
        batchSize: 10,
        retryAttempts: 3
      },
      
      // Actions
      addOperation: (operation) => set((state) => ({
        syncOperations: [...state.syncOperations, operation],
        pendingOperations: [...state.pendingOperations, operation]
      })),
      
      removeOperation: (id) => set((state) => ({
        syncOperations: state.syncOperations.filter(op => op.id !== id),
        pendingOperations: state.pendingOperations.filter(op => op.id !== id),
        failedOperations: state.failedOperations.filter(op => op.id !== id)
      })),
      
      updateOperationStatus: (id, status) => set((state) => ({
        syncOperations: state.syncOperations.map(op => 
          op.id === id ? { ...op, status } : op
        ),
        pendingOperations: status === 'pending' 
          ? state.pendingOperations 
          : state.pendingOperations.filter(op => op.id !== id),
        failedOperations: status === 'failed'
          ? [...state.failedOperations.filter(op => op.id !== id), 
             state.syncOperations.find(op => op.id === id)].filter((op): op is SyncOperation => op !== undefined)
          : state.failedOperations.filter(op => op.id !== id)
      })),
      
      clearOperations: () => set({
        syncOperations: [],
        pendingOperations: [],
        failedOperations: []
      }),
      
      setNetworkStatus: (online, quality = 'good') => set({
        isOnline: online,
        networkQuality: online ? (quality as 'good' | 'poor') : 'offline'
      }),
      
      setSyncStatus: (syncing) => set({
        isSyncing: syncing,
        lastSyncAt: syncing ? get().lastSyncAt : new Date()
      }),
      
      addConflict: (conflict) => set((state) => ({
        conflicts: [...state.conflicts, conflict]
      })),
      
      removeConflict: (id) => set((state) => ({
        conflicts: state.conflicts.filter(c => c.id !== id)
      })),
      
      updateSyncSettings: (settings) => set({
        syncSettings: { ...get().syncSettings, ...settings }
      }),
      
      pauseAllSync: () => set({
        isSyncing: false
      }),
      
      resumeAllSync: () => set({
        isSyncing: true
      }),
      
      forceFullSync: () => set({
        isSyncing: true,
        lastSyncAt: new Date()
      })
    }),
    {
      name: 'myk9show-sync-storage',
      storage: createJSONStorage(() => getOptimalStorage('sync')),
      version: 1
    }
  )
);

export default useSyncStore;