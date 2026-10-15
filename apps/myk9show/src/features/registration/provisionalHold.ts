import {
  isConformationPuppyClass,
  registrationMatchesOrganization,
  toDogRegistrationLike,
  type DogRegistrationLike,
} from '@/features/dogs/identity';
import { getTrialRegistry } from '@/features/registries';
import {
  replicatedClassesTable,
  replicatedDogRegistrationsTable,
  replicatedTrialsTable,
} from '@/services/replication';

/**
 * MYK9-1162: the held verdict for an entry a secretary keys in OFFLINE, until the
 * server's own arrives on the next sync.
 *
 * Everywhere else the client reads the server's `awaiting_registration_number`
 * and never derives it. A row created on this device has no server verdict yet,
 * so without one it would print and look scoreable until sync, then have its
 * score refused. This marks it provisionally held when the device cannot see a
 * number for the trial's registry (blank registry means AKC) and the class is not
 * a conformation puppy class, the same rule the server applies.
 *
 * The bias is deliberate: when the device cannot tell (a registration or trial
 * it cannot read), the entry is held. A wrongly held entry only stays off the
 * paperwork until sync replaces the verdict; a wrongly released one prints and
 * is scored on a dog the server will refuse.
 */
export async function loadProvisionalHolds(
  selections: ReadonlyArray<{ dogId: string; trialId: string; classIds: readonly string[] }>
): Promise<(dogId: string, trialId: string, classId: string) => boolean> {
  const dogIds = [...new Set(selections.map(selection => selection.dogId))];
  const trialIds = [...new Set(selections.map(selection => selection.trialId))];
  const classIds = [...new Set(selections.flatMap(selection => selection.classIds))];

  // Each read through a resolved promise, so one that throws synchronously is a
  // failed read like one that rejects; none may stop the entry being saved.
  const attempt = <T>(read: () => Promise<T>): Promise<T | null> =>
    Promise.resolve()
      .then(read)
      .catch(() => null);
  const [registrationRows, trials, classes] = await Promise.all([
    attempt(() => replicatedDogRegistrationsTable.getRegistrationsForDogs(dogIds)),
    Promise.all(trialIds.map(id => attempt(() => replicatedTrialsTable.getTrialById(id)))),
    Promise.all(classIds.map(id => attempt(() => replicatedClassesTable.getClassById(id)))),
  ]);
  const trialsById = new Map(trialIds.map((id, i) => [id, trials[i] ?? null]));
  const classesById = new Map(classIds.map((id, i) => [id, classes[i] ?? null]));
  const registrationsByDog = new Map<string, DogRegistrationLike[]>();
  for (const row of registrationRows ?? []) {
    const registration = toDogRegistrationLike(row as DogRegistrationLike);
    const source = row as { dog_id?: unknown; dogId?: unknown };
    const dogId = String(source.dog_id ?? source.dogId ?? '');
    registrationsByDog.set(dogId, [...(registrationsByDog.get(dogId) ?? []), registration]);
  }

  return (dogId, trialId, classId) => {
    const trial = trialsById.get(trialId);
    const cls = classesById.get(classId);
    if (
      trial &&
      cls &&
      isConformationPuppyClass({
        trialType: trial.trialType,
        className: cls.name,
        element: cls.element,
        level: cls.level,
      })
    ) {
      return false;
    }
    // An unreadable registrations table, or a trial this device cannot read (so
    // no registry to check against), proves nothing: held. Only a KNOWN trial's
    // blank registry reads as AKC.
    if (registrationRows === null || !trial) return true;
    const registry = getTrialRegistry(trial).id;
    return !(registrationsByDog.get(dogId) ?? []).some(
      registration =>
        (registration.registration_number?.trim() ?? '') !== '' &&
        registrationMatchesOrganization(registration, registry)
    );
  };
}
