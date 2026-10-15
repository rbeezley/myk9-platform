// Pure helper functions for useDogStoreCompat

import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';
import {
  registrationChanges,
  registrationChangesNeedConnection,
} from '@/services/replication/dogRegistrationWrites';
import { saveRegistrationEditOnline } from '@/services/database/registrations/editGuard';
import type { EditableRegistration } from '@/services/replication/dogRegistrationWriteSupport';
import { logger } from '@/services/LoggingService';
import { DEFAULT_REGISTRATION_ORG } from '@/components/dogs/registrationForm';
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
function findMatchingRegistration<T extends { organization: string }>(
  inputReg: RegistrationInput,
  existingRegs: readonly T[]
): T | undefined {
  const inputOrganization = normalizeDogRegistrationOrganization(inputReg.organization || 'AKC');
  return existingRegs.find(
    er => normalizeDogRegistrationOrganization(er.organization) === inputOrganization
  );
}

/**
 * Saves the registration fields of an Edit dog form: edits the dog's
 * registration for each organization the form changed, or adds one.
 * Returns true if any registrations were changed.
 *
 * Online, the candidates are the server's rows plus this device's unsent work;
 * an edit goes straight to the server (registration edits are online-only,
 * MYK9-1090) and an add is queued. When the server cannot be read, any
 * registration change is refused with "Reconnect to save registration
 * changes" BEFORE anything is written: an edit cannot be saved offline, and a
 * new organization cannot be told from one the device has not loaded. Fields
 * the form did not change are not a change. Throws on a refusal; the dog's
 * own fields are saved by the caller either way.
 */
export async function syncDogRegistrations(
  dogId: string,
  registrations: RegistrationInput[]
): Promise<boolean> {
  const toSave = registrations.filter(registration => registration.registeredName);
  if (toSave.length === 0) return false;

  const { registrations: existingRegs, server } =
    await replicatedDogRegistrationsTable.getRegistrationsForEdit(dogId);
  type Planned = {
    inputReg: RegistrationInput;
    existing: EditableRegistration | undefined;
    changes: Record<string, unknown>;
  };
  const plan = toSave.flatMap((inputReg): Planned[] => {
    const existing = findMatchingRegistration(inputReg, existingRegs);
    if (!existing) return [{ inputReg, existing: undefined, changes: {} }];
    const changes = registrationChanges(existing, {
      registered_name: inputReg.registeredName,
      breed: inputReg.type || null,
      status: inputReg.status || null,
    });
    return Object.keys(changes).length > 0 ? [{ inputReg, existing, changes }] : [];
  });
  if (plan.length === 0) return false;
  if (!server) throw registrationChangesNeedConnection();

  for (const { inputReg, existing, changes } of plan) {
    if (existing) {
      await saveRegistrationEditOnline(existing.id, changes);
      logger.debug('Updated registration', 'dogs', {
        registrationId: existing.id,
        registeredName: inputReg.registeredName,
      });
      continue;
    }

    const added = await replicatedDogRegistrationsTable.addRegistration({
      dog_id: dogId,
      organization: inputReg.organization || DEFAULT_REGISTRATION_ORG,
      registered_name: inputReg.registeredName ?? null,
      registration_number: inputReg.number || '',
      breed: inputReg.type || null,
      status: inputReg.status || 'pending',
    });
    logger.debug('Added registration', 'dogs', {
      registrationId: added.id,
      registeredName: inputReg.registeredName,
      organization: inputReg.organization || DEFAULT_REGISTRATION_ORG,
    });
  }

  return true;
}
