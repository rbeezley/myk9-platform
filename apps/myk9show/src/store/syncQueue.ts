/**
 * SyncQueue store stub
 *
 * This store was referenced by Phase 3 offline system tests but was never implemented
 * in myK9Show. Offline sync is handled by @myk9/replication in the myK9Q app.
 *
 * This stub satisfies module resolution for tests. Tests that reference this store
 * use vi.mock() and describe.skip to avoid executing unimplemented code.
 *
 * TODO: Implement if offline sync support is added to myK9Show.
 */
import { create } from 'zustand';

interface SyncQueueItem {
  id: string;
  type: string;
  data: unknown;
  timestamp: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

interface SyncQueueState {
  queue: SyncQueueItem[];
  isProcessing: boolean;
  addToQueue: (item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'status'>) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  processQueue: () => Promise<void>;
  getQueueLength: () => number;
}

export const useSyncQueue = create<SyncQueueState>((set, get) => ({
  queue: [],
  isProcessing: false,

  addToQueue: item => {
    const newItem: SyncQueueItem = {
      ...item,
      id: `sync-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      status: 'pending',
    };
    set(state => ({ queue: [...state.queue, newItem] }));
  },

  removeFromQueue: id => {
    set(state => ({ queue: state.queue.filter(item => item.id !== id) }));
  },

  clearQueue: () => {
    set({ queue: [] });
  },

  processQueue: async () => {
    // Stub: no-op
  },

  getQueueLength: () => {
    return get().queue.length;
  },
}));
