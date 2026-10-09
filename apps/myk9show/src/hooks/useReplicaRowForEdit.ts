import { notifications } from '@/lib/notifications';
import { logger } from '@/services/LoggingService';
import { useOptionalReplicationSync } from '@/hooks/useOptionalReplicationSync';

export interface ReplicaRowForEditOptions<T> {
  /** The provider's table name, e.g. 'dogs', 'dog_registrations', 'people'. */
  tableName: string;
  /** Reads the row from the local replica only. */
  lookup: (id: string) => Promise<T | null>;
  /** Shown when the row is still missing after a sync. */
  missingMessage: string;
  /** 'silent' lets a caller that throws report the message itself. Default 'notify'. */
  onMissing?: 'notify' | 'silent';
}

/**
 * The replica row an edit must queue against (MYK9-1067, MYK9-1070, MYK9-1071).
 *
 * Cold replica (the screen was filled by a PostgREST fallback): run the table's
 * NORMAL sync - the provider's own syncTable - so the replica fills completely
 * and rows arrive with their server version. Never a single-row hydration: a
 * one-row replica reads as "complete" elsewhere. Still missing after the sync:
 * tell the user and return null, so the caller queues nothing.
 */
export function useReplicaRowForEdit<T>({
  tableName,
  lookup,
  missingMessage,
  onMissing = 'notify',
}: ReplicaRowForEditOptions<T>): (id: string) => Promise<T | null> {
  const replicationSync = useOptionalReplicationSync();

  return async (id: string): Promise<T | null> => {
    const warm = await lookup(id);
    if (warm) return warm;

    let cold: T | null = null;
    if (replicationSync) {
      try {
        await replicationSync.syncTable(tableName);
      } catch (err) {
        logger.warn('Sync before edit failed', 'replication', { tableName, id }, err as Error);
      }
      cold = await lookup(id);
    }
    if (!cold && onMissing === 'notify') notifications.error(missingMessage);
    return cold;
  };
}

/**
 * Make a whole table warm before an edit reads a SET of its rows (for example
 * every registration of one dog). Cold → run the table's normal sync once.
 * Returns false when the table is still cold afterwards (offline first use).
 */
export function useEnsureReplicaWarm(
  tableName: string,
  isCold: () => Promise<boolean>
): () => Promise<boolean> {
  const replicationSync = useOptionalReplicationSync();
  return async () => {
    if (!(await isCold())) return true;
    if (replicationSync) {
      try {
        await replicationSync.syncTable(tableName);
      } catch (err) {
        logger.warn('Sync before edit failed', 'replication', { tableName }, err as Error);
      }
    }
    return !(await isCold());
  };
}
