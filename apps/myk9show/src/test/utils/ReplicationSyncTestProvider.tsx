import { useMemo, type ReactNode } from 'react';
import {
  ReplicationSyncActionsContext,
  ReplicationSyncStatusContext,
  type ReplicationSyncActions,
  type ReplicationSyncContextValue,
} from '@/context/ReplicationSyncContext';

/**
 * Publishes a combined `{ status, triggerSync, syncTable }` value the way
 * `ReplicationSyncProvider` does (two contexts). `null` mounts no provider state.
 */
export function ReplicationSyncTestProvider({
  value,
  children,
}: {
  value: ReplicationSyncContextValue | null;
  children?: ReactNode;
}) {
  const hasValue = value !== null;
  const triggerSync = value?.triggerSync;
  const syncTable = value?.syncTable;
  const actions = useMemo(
    () => (hasValue ? ({ triggerSync, syncTable } as ReplicationSyncActions) : null),
    [hasValue, triggerSync, syncTable]
  );
  return (
    <ReplicationSyncStatusContext.Provider value={value?.status ?? null}>
      <ReplicationSyncActionsContext.Provider value={actions}>
        {children}
      </ReplicationSyncActionsContext.Provider>
    </ReplicationSyncStatusContext.Provider>
  );
}
