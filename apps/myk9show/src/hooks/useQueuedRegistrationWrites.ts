import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import {
  replicatedDogRegistrationsTable,
  type RegistrationAddFields,
  type RegistrationEditableFields,
} from '@/services/replication/ReplicatedDogRegistrationsTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { useReplicaRowForEdit } from '@/hooks/useReplicaRowForEdit';
import { refreshCachedRegistrations } from '@/hooks/refreshCachedRegistrations';

export const REGISTRATION_NOT_ON_DEVICE =
  'This registration is not saved on this device yet. Reconnect and try the edit again.';

/**
 * Registration add and edit through the replication mutation queue (MYK9-1071).
 * Delete stays online for now (MYK9-1075).
 *
 * - add: a queued INSERT. A dog that exists only on this device makes the
 *   registration wait for the dog's own INSERT.
 * - edit: the cold-replica rule (one normal sync, never single-row hydration),
 *   then a queued full-row UPDATE with the row's server version. Throws when the
 *   row is still not on the device, so an edit panel keeps the user's form.
 */
export function useQueuedRegistrationWrites() {
  const queryClient = useQueryClient();
  const getRegistrationForEdit = useReplicaRowForEdit({
    tableName: 'dog_registrations',
    lookup: id => replicatedDogRegistrationsTable.getRegistrationById(id),
    missingMessage: REGISTRATION_NOT_ON_DEVICE,
    onMissing: 'silent',
  });

  const refresh = async (dogId: string) => {
    await refreshCachedRegistrations(queryClient, dogId);
    queryClient.invalidateQueries({ queryKey: queryKeys.dogs });
  };

  const addRegistration = async (dogId: string, fields: RegistrationAddFields) => {
    const dog = await replicatedDogsTable.getDogById(dogId);
    const dependsOn = dog?._localOnly
      ? await replicatedDogsTable.getPendingMutationIdsForRow(dogId)
      : undefined;
    const registration = await replicatedDogRegistrationsTable.addRegistration(
      dogId,
      fields,
      dependsOn ? { dependsOn } : {}
    );
    await refresh(dogId);
    return registration;
  };

  const editRegistration = async (id: string, fields: Partial<RegistrationEditableFields>) => {
    const current = await getRegistrationForEdit(id);
    if (!current) throw new Error(REGISTRATION_NOT_ON_DEVICE);
    await replicatedDogRegistrationsTable.updateRegistration(id, fields);
    await refresh(current.dogId);
  };

  return { addRegistration, editRegistration };
}
