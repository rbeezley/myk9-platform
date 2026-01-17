import { createContext } from 'react';

interface SyncStatus {
  isSyncing: boolean;
  lastSyncAt: Date | null;
  error: string | null;
  tablesStatus: Record<string, 'idle' | 'syncing' | 'success' | 'error'>;
}

export interface ReplicationSyncContextValue {
  status: SyncStatus;
  triggerSync: () => Promise<void>;
  syncTable: (tableName: string) => Promise<void>;
}

export const ReplicationSyncContext = createContext<ReplicationSyncContextValue | null>(null);
