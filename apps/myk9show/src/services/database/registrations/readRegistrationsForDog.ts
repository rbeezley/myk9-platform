import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';
import { getRegistrationsByDog } from './reads';
import {
  normalizeDogRegistrationNumber,
  normalizeDogRegistrationOrganization,
} from '@/utils/dogIdentity';

const registryIdentity = (row: Record<string, unknown>) =>
  `${normalizeDogRegistrationOrganization(row.organization as string | null)}|${normalizeDogRegistrationNumber(row.registration_number as string | null)}`;

/**
 * One dog's registrations for the Registrations list: the PostgREST read with
 * this device's UNSENT writes overlaid (MYK9-1071). A queued edit replaces its
 * server row; a queued add is appended unless the server already holds the same
 * registration (a mirror of the dog's create RPC, under a server id). A row the
 * server has, or deleted, is never read from the replica.
 */
export async function readRegistrationsForDog(
  dogId: string
): Promise<{ data: Record<string, unknown>[]; error: unknown }> {
  const unsent = await replicatedDogRegistrationsTable
    .getRegistrationsForDog(dogId)
    .catch(() => [] as Record<string, unknown>[]);
  const server = await getRegistrationsByDog(dogId);
  // A failed read is reported, never answered with the unsent rows alone: that
  // would REPLACE the cached list (losing every registration the server holds)
  // on an offline refetch. React Query keeps the cached data on an error, and
  // queued writes are merged into it by applyRegistrationCacheUpdate.
  if (server.error) return server;

  const byId = new Map(unsent.map(row => [row.id, row]));
  const merged = (server.data as Record<string, unknown>[]).map(row =>
    byId.has(row.id) ? { ...row, ...byId.get(row.id)! } : row
  );
  const known = new Set(merged.map(row => row.id));
  const identities = new Set(merged.map(registryIdentity));
  for (const row of unsent) {
    if (!known.has(row.id) && !identities.has(registryIdentity(row))) merged.push(row);
  }
  return { data: merged, error: null };
}
