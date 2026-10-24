import { useContext } from 'react';
import { ReplicationSyncActionsContext } from '@/context/ReplicationSyncContext';

/**
 * Non-throwing counterpart to `useReplicationSyncActions`, for hooks that may
 * run outside the provider (bare-mounted tests) and treat "no provider" as
 * "no way to trigger a sync".
 */
export const useOptionalReplicationSyncActions = () =>
  useContext(ReplicationSyncActionsContext) ?? null;
