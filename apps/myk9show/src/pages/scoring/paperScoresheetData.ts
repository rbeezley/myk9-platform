import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import {
  resolveDogIdentityForOrganization,
  type DogRegistrationLike,
} from '@/features/dogs/identity';
import { getTrialRegistry } from '@/features/registries';
import { loadDogRegistrations } from '@/services/database/dogs/reads';
import { toScoringEntry } from './types';
import type { ScoringEntry } from './types';

/** Fetch all entries for a class with their dog data, parallelising dog lookups. */
export async function loadEntriesWithDogs(classId: string): Promise<ScoringEntry[]> {
  const rawEntries = await replicatedEntriesTable.getEntriesByClass(classId);
  const uniqueDogIds = [...new Set(rawEntries.map(e => e.dogId).filter(Boolean))] as string[];
  const dogs = await Promise.all(uniqueDogIds.map(id => replicatedDogsTable.get(id)));
  const dogsMap = new Map(uniqueDogIds.map((id, i) => [id, dogs[i] ?? null]));
  const registry = await loadClassRegistryForClass(classId);
  const registeredBreedByDogId = await loadRegisteredBreedsByDogId(uniqueDogIds, registry);
  return rawEntries.map((e, i) =>
    toScoringEntry(
      e,
      dogsMap.get(e.dogId ?? '') ?? null,
      i,
      e.dogId ? registeredBreedByDogId.get(e.dogId) : undefined
    )
  );
}

/**
 * The sanctioning registry of THIS class's trial.
 *
 * Deliberately not `show.organization` (MYK9-90 review round 3): a show may mix
 * registries across trials, and scoping to the show-level organization made
 * every registration that matched the trial but not the show resolve to "no
 * breed" — printing a blank on an official scoresheet. Same per-class-registry
 * rule already applied in `useEntryEligibility`.
 */
export async function loadClassRegistryForClass(classId: string): Promise<string | undefined> {
  const cls = await replicatedClassesTable.getClassById(classId);
  if (!cls?.trialId) return undefined;
  const trial = await replicatedTrialsTable.getTrialById(cls.trialId);
  if (!trial) return undefined;
  return getTrialRegistry(trial).id;
}

/**
 * Breeds for a paper scoresheet, resolved against the class's registry.
 *
 * The invariant on printed paperwork is **correct or visibly refused** — never
 * silently blank, never borrowed from another registry:
 *
 *  - Registrations readable, dog has one for this registry  -> that breed.
 *  - Registrations readable, dog has none for this registry -> explicit `null`,
 *    which `toScoringEntry` renders blank and no fallback may override. The dog
 *    genuinely has no breed here, so a blank is the CORRECT render.
 *  - Registrations NOT readable -> throw. The caller turns this into the page's
 *    blocking error state, so nothing prints.
 *
 * The refusal is decided PER DOG and then applied to the whole sheet.
 *
 * Round 3 gated refusal on `byDog.size === 0`, which is a per-CLASS test: one
 * locally-cached dog made the map non-empty and waved the entire class through,
 * so every other dog printed a blank that had never been verified. A blank
 * meaning "verified absent" and a blank meaning "we never checked" rendered
 * identically on paper, which is precisely what nobody can audit afterwards.
 *
 * When the server leg failed, a `null` for any single dog is unprovable — the
 * replica only holds registrations created on THIS device
 * (`ReplicatedDogRegistrationsTable.sync()` is a no-op), so absence there is not
 * evidence of absence. Refusing the sheet rather than dropping the one dog is
 * deliberate: a scoresheet silently missing one dog's breed is harder to catch
 * than one that refuses to render. A fully-cached class still prints, which
 * keeps the genuinely offline flow working.
 */
export async function loadRegisteredBreedsByDogId(
  dogIds: string[],
  organization: string | undefined
): Promise<Map<string, string | null>> {
  // No registry in context means this is not an organization-scoped render, so
  // leave the map empty and let the caller's generic fallback answer.
  if (!organization || dogIds.length === 0) return new Map();

  const { byDog, serverError, registrationsReadComplete } = await loadDogRegistrations(dogIds);

  // Every requested dog gets an ENTRY, `null` when it holds no registration
  // with this registry. An absent map key would let `toScoringEntry` fall back
  // to `dogs.breed` / the view's `dog_breed`, which is how a UKC-only dog ended
  // up printing its UKC breed on an AKC scoresheet.
  const breeds = new Map<string, string | null>();
  for (const dogId of dogIds) {
    const rows = (byDog.get(dogId) ?? []) as DogRegistrationLike[];
    breeds.set(dogId, resolveDogIdentityForOrganization(rows, organization).breed);
  }

  if (serverError || registrationsReadComplete === false) {
    const unverifiable = dogIds.filter(id => breeds.get(id) == null);
    if (unverifiable.length > 0) {
      throw new Error(
        `Could not verify registrations for ${unverifiable.length} of ${dogIds.length} dogs in this class, ` +
          'so their breeds cannot be confirmed. Reconnect and retry rather than printing a partly-verified form.'
      );
    }
  }

  return breeds;
}
