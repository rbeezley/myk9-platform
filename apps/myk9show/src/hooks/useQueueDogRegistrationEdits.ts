import { useQueryClient } from '@tanstack/react-query';
import { notifications } from '@/lib/notifications';
import { queryKeys } from '@/lib/queryClient';
import { logger } from '@/services/LoggingService';
import type { DogInput } from '@/store/dogStore';
import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { syncDogRegistrations } from '@/hooks/dogStoreCompatHelpers';
import { useEnsureReplicaWarm } from '@/hooks/useReplicaRowForEdit';
import { refreshCachedRegistrations } from '@/hooks/refreshCachedRegistrations';

type RegistrationEdits = NonNullable<DogInput['registrations']>;

const REGISTRATIONS_NOT_ON_DEVICE =
  'Dog details saved, but registrations are not on this device yet. Reconnect and edit the registrations again.';

/**
 * Queue the registration part of a dog edit (MYK9-1071). The registrations
 * replica must be warm (cold → one normal sync), because the edit decides
 * update-or-create from the dog's local registrations. A registration for a dog
 * that exists only on this device waits for the dog's own INSERT.
 */
export function useQueueDogRegistrationEdits(): (
  dogId: string,
  registrations: RegistrationEdits
) => Promise<void> {
  const queryClient = useQueryClient();
  const ensureWarm = useEnsureReplicaWarm('dog_registrations', () =>
    replicatedDogRegistrationsTable.isCold()
  );

  return async (dogId, registrations) => {
    if (registrations.length === 0) return;
    try {
      if (!(await ensureWarm())) {
        notifications.warning(REGISTRATIONS_NOT_ON_DEVICE);
        return;
      }
      const dog = await replicatedDogsTable.getDogById(dogId);
      const dependsOn = dog?._localOnly
        ? await replicatedDogsTable.getPendingMutationIdsForRow(dogId)
        : undefined;
      const changed = await syncDogRegistrations(
        dogId,
        registrations,
        dependsOn ? { dependsOn } : {}
      );
      if (changed) {
        await refreshCachedRegistrations(queryClient, dogId);
        queryClient.invalidateQueries({ queryKey: queryKeys.dogs });
      }
    } catch (err) {
      logger.error('Failed to queue registration changes', 'dogs', { dogId }, err as Error);
      notifications.warning(
        'Dog details saved, but registration changes could not be saved. Please try editing registrations again.'
      );
    }
  };
}
