import { useContext } from 'react';
import { ReplicationSyncActionsContext } from '@/context/ReplicationSyncContext';

/**
 * `triggerSync` / `syncTable` without subscribing to `status`. Use this in
 * consumers that never read the sync status, so a sync pass does not re-render them.
 */
export const useReplicationSyncActions = () => {
  const context = useContext(ReplicationSyncActionsContext);
  if (!context) {
    throw new Error('useReplicationSyncActions must be used within ReplicationSyncProvider');
  }
  return context;
};
