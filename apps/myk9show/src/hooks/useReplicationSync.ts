import { useContext, useMemo } from 'react';
import {
  ReplicationSyncActionsContext,
  ReplicationSyncStatusContext,
  type ReplicationSyncContextValue,
} from '@/context/ReplicationSyncContext';

/** Status plus actions. Re-renders on every sync-pass transition; use `useReplicationSyncActions` if `status` is not read. */
export const useReplicationSync = (): ReplicationSyncContextValue => {
  const status = useContext(ReplicationSyncStatusContext);
  const actions = useContext(ReplicationSyncActionsContext);
  const value = useMemo(
    () => (status && actions ? { status, ...actions } : null),
    [status, actions]
  );
  if (!value) {
    throw new Error('useReplicationSync must be used within ReplicationSyncProvider');
  }
  return value;
};
