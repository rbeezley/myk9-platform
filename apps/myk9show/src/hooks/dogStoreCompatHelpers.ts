// Pure helper functions for useDogStoreCompat

import {
  replicatedDogRegistrationsTable,
  type ReplicatedDogRegistration,
} from '@/services/replication/ReplicatedDogRegistrationsTable';
import { logger } from '@/services/LoggingService';
import { normalizeDogRegistrationOrganization } from '@/utils/dogIdentity';

interface RegistrationInput {
  registeredName?: string | undefined;
  organization?: string | undefined;
  number?: string | undefined;
  type?: string | undefined;
  status?: string | undefined;
}

/**
 * Finds an existing registration matching the given organization.
 */
function findMatchingRegistration(
  inputReg: RegistrationInput,
  existingRegs: readonly ReplicatedDogRegistration[]
): ReplicatedDogRegistration | undefined {
  const inputOrganization = normalizeDogRegistrationOrganization(inputReg.organization || 'AKC');
  return existingRegs.find(
    er => normalizeDogRegistrationOrganization(er.organization) === inputOrganization
  );
}

/**
 * Saves the registration fields of an Edit dog form: edits the dog's
 * registration for each organization, or adds one. Both are queued on the
 * registrations replica (MYK9-1090), so they work offline.
 * Returns true if any registrations were changed.
 *
 * Throws when the dog's registrations cannot be read on this device (offline
 * on a replica that never synced: "Reconnect to load this dog's
 * registrations") or a write is refused; nothing is queued for the refused one.
 */
export async function syncDogRegistrations(
  dogId: string,
  registrations: RegistrationInput[]
): Promise<boolean> {
  const toSave = registrations.filter(registration => registration.registeredName);
  if (toSave.length === 0) return false;

  const existingRegs = await replicatedDogRegistrationsTable.getRegistrationsForEdit(dogId);
  let changed = false;

  for (const inputReg of toSave) {
    const existing = findMatchingRegistration(inputReg, existingRegs);

    if (existing) {
      await replicatedDogRegistrationsTable.updateRegistration(existing.id, {
        registered_name: inputReg.registeredName,
        breed: inputReg.type || null,
        status: inputReg.status || null,
      });
      logger.debug('Updated registration', 'dogs', {
        registrationId: existing.id,
        registeredName: inputReg.registeredName,
      });
      changed = true;
      continue;
    }

    const added = await replicatedDogRegistrationsTable.addRegistration({
      dog_id: dogId,
      organization: inputReg.organization || 'AKC',
      registered_name: inputReg.registeredName ?? null,
      registration_number: inputReg.number || '',
      breed: inputReg.type || null,
      status: inputReg.status || 'pending',
    });
    logger.debug('Added registration', 'dogs', {
      registrationId: added.id,
      registeredName: inputReg.registeredName,
      organization: inputReg.organization || 'AKC',
    });
    changed = true;
  }

  return changed;
}
