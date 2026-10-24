import { createContext } from 'react';
import type { UploadSyncTarget } from '@/providers/ringsideUploadSyncTargets';

interface SyncStatus {
  isSyncing: boolean;
  lastSyncAt: Date | null;
  error: string | null;
  tablesStatus: Record<string, 'idle' | 'syncing' | 'success' | 'error'>;
}

/** Referentially stable for the provider's lifetime: reading it never re-renders on a sync pass. */
export interface ReplicationSyncActions {
  /** No targets: a full pass. Targets: a scoped pass over just those tables and scopes. */
  triggerSync: (targets?: UploadSyncTarget[]) => Promise<void>;
  syncTable: (tableName: string) => Promise<void>;
}

/** The combined shape `useReplicationSync()` returns; the provider publishes it as two contexts. */
export interface ReplicationSyncContextValue extends ReplicationSyncActions {
  status: SyncStatus;
}

/** Hot: changes on every sync-pass transition. Subscribe only when the status is rendered. */
export const ReplicationSyncStatusContext = createContext<
  ReplicationSyncContextValue['status'] | null
>(null);

/** Cold: `triggerSync` / `syncTable`. Consumers that never read `status` subscribe here. */
export const ReplicationSyncActionsContext = createContext<ReplicationSyncActions | null>(null);
