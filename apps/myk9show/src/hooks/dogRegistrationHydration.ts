/**
 * Where a dog's registrations come from, and whether that source is authoritative.
 *
 * Breed, registered name and variety belong to a `dog_registrations` row, not to
 * the dog (MYK9-90). So every surface that maps a dog has to answer two
 * questions before it can show a breed:
 *
 *   1. Which source has this dog's registrations — the server, the offline
 *      replica, or something already in memory?
 *   2. Is an EMPTY answer from that source proof the dog has none, or just proof
 *      that we did not look hard enough?
 *
 * Getting (2) wrong is what makes a dog's breed vanish or a deleted registration
 * come back, so the two readers below differ deliberately in which source they
 * trust and what an empty result is allowed to mean. They are kept together
 * because that trade-off — not the mapping — is the actual subject matter.
 *
 * A note for whoever changes this next: the registrations replica syncs
 * (MYK9-1090), but an empty answer from it is evidence of absence ONLY once it
 * is warm (`readForDogs`). A cold replica holds just the registrations created
 * on this device. Several fixes here exist because emptiness was trusted when
 * it should not have been.
 */

import type { QueryClient } from '@tanstack/react-query';
import type { Dog } from '@/types/dog-types';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import { mapDatabaseToDog, mapReplicatedDogToDbRow } from '@/services/mappers/dogMappers';
import { loadDogRegistrations } from '@/services/database/dogs/reads';
import { queryKeys } from '@/lib/queryClient';

/**
 * Map a replicated dog to a `Dog`, hydrating its registrations first.
 *
 * MYK9-90: breed is resolved from `dog_registrations`, so mapping a dog with no
 * registrations attached yields "Breed not set". `updateDog` fed the mapper a
 * bare row and handed the result straight to `DogDialogs`, which flipped a
 * registered dog's breed label to "Breed not set" until the next refetch.
 *
 * Reads through `loadDogRegistrations`: the replica alone once it is warm,
 * otherwise the server merged with whatever the replica holds. Round 2 read
 * the replica alone while it never synced, so for the common dog it returned
 * nothing and the label still flipped to "Breed not set"; the warm check is
 * what makes a replica-only answer safe now (MYK9-1090).
 *
 * ONLY use this off the latency-critical path. `updateDog` is local-first and
 * must not await a network read — see `cachedRegistrationRowsForDog`.
 *
 * NOTE on the alternative: making the mapper treat "registrations key absent"
 * as "not loaded" and fall back to `dbDog.breed` was rejected. That fallback is
 * a read of `dogs.breed`, the exact column this change exists to stop reading,
 * and section 6 drops it — so the branch would silently become a blank anyway.
 * Hydrating at the caller keeps one meaning for an empty registration list:
 * the dog genuinely has none.
 */
export async function mapReplicatedDogWithRegistrations(dog: ReplicatedDog): Promise<Dog> {
  const result = await loadDogRegistrations([dog.id]).catch(() => ({
    byDog: new Map<string, Record<string, unknown>[]>(),
    registrationsReadComplete: false,
  }));
  const registrations = result.byDog.get(dog.id) ?? [];
  return mapDatabaseToDog(
    mapReplicatedDogToDbRow(dog, {
      registrations,
      registrationsReadComplete: result.registrationsReadComplete,
    })
  );
}

/**
 * Registrations for a dog from data ALREADY in memory — no network, no await.
 *
 * `updateDog` is local-first: a call-name-only edit at a venue must not wait on
 * PostgREST to fail or time out before the UI updates. Round 3 solved the
 * "Breed not set" flash by awaiting the merged read here, which fixed
 * correctness by moving a request onto the latency-critical path. Both
 * constraints are real, so they are satisfied separately: this synchronous
 * lookup serves the immediate return, and the existing query invalidation
 * refreshes from the server asynchronously.
 *
 * `alreadyLoadedDogs` comes from the caller's dogs query. BOTH of that query's
 * paths embed registrations — the replication path via `loadDogRegistrations`,
 * the PostgREST fallback via `registrations:dog_registrations(*)` — so a dog
 * PRESENT in the list carries an authoritative registration array, including
 * when that array is empty.
 *
 * Presence is therefore the test, not length (MYK9-90 review round 5). Falling
 * through an authoritative empty list to `registrationsByDog` resurrected
 * deleted registrations: an invalidated-but-inactive query keeps serving its old
 * data, so after deleting a registration, editing an UNRELATED field brought the
 * old breed back until the next refetch.
 *
 * This is the same "absent vs. present-and-empty" distinction settled in round
 * 1, when hydrate-at-the-callers was chosen so an empty registration list would
 * have exactly one meaning: the dog genuinely has none. The cache fallback had
 * reintroduced the ambiguity one layer up.
 *
 * Registration completeness is now propagated alongside the list. A failed
 * read keeps the registrations collected before the failure for display, but
 * marks `registrationsReadComplete` false so an unrelated local-first edit can
 * prefer a good per-dog cache without discarding known rows. The existing 191
 * read sites continue to use the same registration array contract; only this
 * cache authority decision needs the extra bit.
 */
export function cachedRegistrationRowsForDog(
  dogId: string,
  alreadyLoadedDogs: Dog[],
  queryClient: QueryClient
): Record<string, unknown>[] {
  const loadedDog = alreadyLoadedDogs.find(d => d.id === dogId);
  if (loadedDog && loadedDog.registrationsReadComplete !== false) {
    return (loadedDog.registrations ?? []) as unknown as Record<string, unknown>[];
  }

  const cached = queryClient.getQueryData(queryKeys.registrationsByDog(dogId));
  if (Array.isArray(cached)) return cached as Record<string, unknown>[];

  // A failed merged read may still contain server rows. Preserve those rows
  // when no better per-dog cache exists; completeness remains false for
  // callers that require a verified read.
  return (loadedDog?.registrations ?? []) as unknown as Record<string, unknown>[];
}
