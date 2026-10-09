import { useReplicaRowForEdit } from '@/hooks/useReplicaRowForEdit';
import {
  replicatedDogsTable,
  type ReplicatedDog,
} from '@/services/replication/ReplicatedDogsTable';

/**
 * The replica row a dog edit must queue against (MYK9-1067, MYK9-1070). The
 * cold-replica rule lives in `useReplicaRowForEdit`.
 */
export const useDogReplicaForEdit = (): ((id: string) => Promise<ReplicatedDog | null>) =>
  useReplicaRowForEdit({
    tableName: 'dogs',
    lookup: id => replicatedDogsTable.getDogById(id),
    missingMessage: 'This dog is not saved on this device yet. Reconnect and try the edit again.',
  });
