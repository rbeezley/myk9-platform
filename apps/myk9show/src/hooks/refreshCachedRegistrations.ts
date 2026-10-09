import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { readRegistrationsForDog } from '@/services/database/registrations/replicaFirstReads';

/**
 * Show a queued registration add or edit in the dog's Registrations list at
 * once (MYK9-1071). The list query reads replica-first, so the cache is set from
 * the same source, then invalidated so every other reader refreshes.
 */
export async function refreshCachedRegistrations(
  queryClient: QueryClient,
  dogId: string
): Promise<void> {
  const { data, error } = await readRegistrationsForDog(dogId);
  if (!error) queryClient.setQueryData(queryKeys.registrationsByDog(dogId), data);
  queryClient.invalidateQueries({ queryKey: queryKeys.registrationsByDog(dogId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.dogRegistrations(dogId) });
}
