import { isHeldEntry } from '@/features/dogs/identity';
import { getTrialRegistry } from '@/features/registries';
import type { Dog } from '@/types/dog-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';

/** The trial fields the held-entry rule reads (a raw `trials` row or a mapped trial). */
interface TrialWithRegistry {
  id: string;
  registry_id?: string | null;
  registryId?: string | null | undefined;
}

/** One entry awaiting a registration number, with what the pane needs to resolve it. */
export interface RegistrationNeededRow {
  entry: EntryManagementEntry;
  /** The trial's registry, the one the missing number is for. */
  registryId: string;
  /** The dog the registration is added on; absent when the roster does not hold it. */
  dog: Dog | undefined;
}

/**
 * The show's entries awaiting a registration number (MYK9-1162): the entries the
 * server marks as held (`awaitingRegistrationNumber`, carried on the cockpit's
 * loaded entries, offline included), with the trial registry the missing number
 * is for and the dog it is added on.
 *
 * Whether an entry is held is never rederived from the dog's registrations on
 * this device. An entry whose trial is not loaded is left out (there is no
 * registry to name); a dog missing from the roster still lists, without the
 * Add registration action.
 */
export function findEntriesAwaitingRegistrationNumber(input: {
  entries: readonly EntryManagementEntry[];
  trials: readonly TrialWithRegistry[];
  dogs: readonly Dog[];
}): RegistrationNeededRow[] {
  const trialsById = new Map(input.trials.map(trial => [trial.id, trial] as const));
  const dogsById = new Map(input.dogs.map(dog => [dog.id, dog] as const));

  const rows: RegistrationNeededRow[] = [];
  for (const entry of input.entries) {
    const held = isHeldEntry({
      entryStatus: entry.rawEntryStatus ?? undefined,
      awaitingRegistrationNumber: entry.awaitingRegistrationNumber,
    });
    const trialId = entry.classes[0]?.trialId;
    const trial = trialId ? trialsById.get(trialId) : undefined;
    if (!held || !trial) continue;
    rows.push({ entry, registryId: getTrialRegistry(trial).id, dog: dogsById.get(entry.dogId) });
  }
  return rows;
}
