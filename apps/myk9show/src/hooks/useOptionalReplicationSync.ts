import { useContext, useMemo } from 'react';
import {
  ReplicationSyncActionsContext,
  ReplicationSyncStatusContext,
  type ReplicationSyncContextValue,
} from '@/context/ReplicationSyncContext';

/**
 * Non-throwing counterpart to `useReplicationSync`, for ambient widgets that
 * may render outside the provider (tests, isolated stories) and must degrade
 * rather than crash — the `LiveUpdateIndicator` precedent.
 */
export const useOptionalReplicationSync = (): ReplicationSyncContextValue | null => {
  const status = useContext(ReplicationSyncStatusContext);
  const actions = useContext(ReplicationSyncActionsContext);
  return useMemo(() => (status && actions ? { status, ...actions } : null), [status, actions]);
};
