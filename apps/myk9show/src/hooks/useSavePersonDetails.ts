import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import type { PersonUpdate } from '@/services/database/users';
import { replicatedShowDeskPeopleTable } from '@/services/replication/ReplicatedShowDeskPeopleTable';
import { savePersonDetails, type PersonSaveResult } from '@/services/replication/personSave';
import { PERSON_NOT_ON_DEVICE_MESSAGE } from '@/utils/signInEmailMessages';
import { useReplicaRowForEdit } from '@/hooks/useReplicaRowForEdit';
import { patchCachedPersonRows } from '@/hooks/patchCachedPersonRows';

/**
 * A person save for the edit panel and the profile page (MYK9-1071): queued
 * when it can be, online for an email change (see savePersonDetails). Applies
 * the cold-replica rule first and shows a queued save in the cached people
 * reads at once.
 */
export function useSavePersonDetails(): (
  personId: string,
  updates: PersonUpdate
) => Promise<PersonSaveResult> {
  const queryClient = useQueryClient();
  const getRow = useReplicaRowForEdit({
    tableName: 'people',
    lookup: id => replicatedShowDeskPeopleTable.getPersonById(id),
    missingMessage: PERSON_NOT_ON_DEVICE_MESSAGE,
    onMissing: 'silent',
  });

  return async (personId, updates) => {
    const result = await savePersonDetails(personId, updates, { getRow });
    if (result.route === 'queued')
      patchCachedPersonRows(queryClient, personId, result.columns, result.privatePatch);
    // A queued save is not invalidated: a refetch now would read the server
    // before the upload lands and overwrite the patch (the people reads overlay
    // pending replica values, and the upload's own sync refreshes them later).
    if (result.route === 'online') queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    return result;
  };
}
