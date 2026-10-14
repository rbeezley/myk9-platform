import {
  isAwaitingRegistrationNumber,
  registrationsIfKnown,
  type ConformationPuppyContext,
} from '@/features/dogs/identity';
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
  /** The dog the registration is added on. Always loaded: an unloaded dog is never held. */
  dog: Dog;
}

/**
 * The show's entries awaiting a registration number (MYK9-1162), derived on every
 * call and never stored: `isAwaitingRegistrationNumber` over the cockpit's loaded
 * entries, the show's trials (for each trial's registry) and the dog roster the
 * secretary's device holds.
 *
 * Anything not loaded is unknown, and unknown is not held: an entry whose trial
 * or dog is missing, or whose dog's registrations were not read completely, is
 * left out rather than reported as missing a number.
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
    const entryClass = entry.classes[0];
    const trial = entryClass?.trialId ? trialsById.get(entryClass.trialId) : undefined;
    const dog = dogsById.get(entry.dogId);
    if (!entryClass || !trial || !dog) continue;

    const registryId = getTrialRegistry(trial).id;
    const puppyContext: ConformationPuppyContext = {
      trialType: entryClass.trialType,
      className: entryClass.name,
      element: undefined,
      level: undefined,
    };
    if (
      isAwaitingRegistrationNumber(
        { entryStatus: entry.rawEntryStatus ?? undefined },
        registryId,
        registrationsIfKnown(dog),
        puppyContext
      )
    ) {
      rows.push({ entry, registryId, dog });
    }
  }
  return rows;
}
