import { createContext } from 'react';
import type { UploadSyncTarget } from '@/providers/ringsideUploadSyncTargets';

interface SyncStatus {
  isSyncing: boolean;
  lastSyncAt: Date | null;
  error: string | null;
  tablesStatus: Record<string, 'idle' | 'syncing' | 'success' | 'error'>;
}

export interface ReplicationSyncContextValue {
  status: SyncStatus;
  /** No targets: a full pass. Targets: a scoped pass over just those tables and scopes. */
  triggerSync: (targets?: UploadSyncTarget[]) => Promise<void>;
  syncTable: (tableName: string) => Promise<void>;
}

export const ReplicationSyncContext = createContext<ReplicationSyncContextValue | null>(null);
