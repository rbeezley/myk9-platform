/**
 * The breed shown on a LIVE scoresheet (MYK9-1086), held to the same rule as
 * paper (MYK9-90): only the dog's registered breed for this class's registry,
 * never `dogs.breed` borrowed from another registry.
 *
 * Unlike paper, a live sheet must open instantly and offline, and it is used
 * by passcode sessions that cannot read `dog_registrations` from the server.
 * So this reads ONLY the local replica (no network request) and answers
 * `null` whenever the breed cannot be confirmed: no registry cached, no
 * registration for it on this device, or the read failed. The caller shows
 * no breed until a confirmed one arrives.
 */
import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';
import {
  resolveDogIdentityForOrganization,
  type DogRegistrationLike,
} from '@/features/dogs/identity';
import { logger } from '@/services/LoggingService';
import { loadClassRegistryForClass } from './paperScoresheetData';

export async function resolveLiveScoringBreed(
  classId: string,
  dogId: string | null | undefined
): Promise<string | null> {
  if (!dogId) return null;
  try {
    const registry = await loadClassRegistryForClass(classId);
    if (!registry) return null;
    const rows = (await replicatedDogRegistrationsTable.getRegistrationsForDogs([
      dogId,
    ])) as DogRegistrationLike[];
    return resolveDogIdentityForOrganization(rows, registry).breed || null;
  } catch (error) {
    // A blank breed is the honest render; keep the cause visible to debugging.
    logger.debug('Live scoresheet breed unavailable', 'pages', { classId, dogId }, error as Error);
    return null;
  }
}
