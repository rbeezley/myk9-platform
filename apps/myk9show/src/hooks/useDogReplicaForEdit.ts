import { notifications } from '@/lib/notifications';
import { logger } from '@/services/LoggingService';
import { useOptionalReplicationSync } from '@/hooks/useOptionalReplicationSync';
import {
  replicatedDogsTable,
  type ReplicatedDog,
} from '@/services/replication/ReplicatedDogsTable';

/**
 * The replica row a dog edit must queue against (MYK9-1067, MYK9-1070).
 *
 * Cold replica (roster filled by the PostgREST fallback): run the dogs table's
 * NORMAL sync - the provider's own syncTable - so the replica fills completely
 * (a one-row replica would read as "complete" and shrink the roster) and rows
 * arrive with their server version. No partial replica writes, and never a
 * replica row built from the roster's display model. Still missing after the
 * sync: tell the user and return null, so the caller queues nothing.
 */
export const useDogReplicaForEdit = () => {
  const replicationSync = useOptionalReplicationSync();

  return async (id: string): Promise<ReplicatedDog | null> => {
    const warm = await replicatedDogsTable.getDogById(id);
    if (warm) return warm;

    let cold: ReplicatedDog | null = null;
    if (replicationSync) {
      try {
        await replicationSync.syncTable('dogs');
      } catch (err) {
        logger.warn('Dogs sync before edit failed', 'dogs', { dogId: id }, err as Error);
      }
      cold = await replicatedDogsTable.getDogById(id);
    }
    if (!cold) {
      notifications.error(
        'This dog is not saved on this device yet. Reconnect and try the edit again.'
      );
    }
    return cold;
  };
};
