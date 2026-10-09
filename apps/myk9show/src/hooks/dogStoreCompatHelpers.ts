// Pure helper functions for useDogStoreCompat

import { logger } from '@/services/LoggingService';
import {
  replicatedDogRegistrationsTable,
  type ReplicatedDogRegistration,
} from '@/services/replication/ReplicatedDogRegistrationsTable';
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
  existingRegs: ReplicatedDogRegistration[]
): ReplicatedDogRegistration | undefined {
  const inputOrganization = normalizeDogRegistrationOrganization(inputReg.organization || 'AKC');
  return existingRegs.find(
    er => normalizeDogRegistrationOrganization(er.organization) === inputOrganization
  );
}

/**
 * Updates or creates registrations for a dog through the replication mutation
 * queue (MYK9-1071): an existing organization gets a queued UPDATE, a new one a
 * queued INSERT. Reads the local replica, so the caller must make sure the
 * registrations replica is warm first (useEnsureReplicaWarm).
 * Returns true if any registrations were changed.
 */
export async function syncDogRegistrations(
  dogId: string,
  registrations: RegistrationInput[],
  options: { dependsOn?: string[] } = {}
): Promise<boolean> {
  if (registrations.length === 0) return false;

  let changed = false;
  const existingRegs = await replicatedDogRegistrationsTable.getLocalRegistrationsForDog(dogId);
  const toCreate: RegistrationInput[] = [];

  for (const inputReg of registrations) {
    if (!inputReg.registeredName) continue;

    const existing = findMatchingRegistration(inputReg, existingRegs);
    if (existing) {
      await replicatedDogRegistrationsTable.updateRegistration(existing.id, {
        registeredName: inputReg.registeredName,
        breed: inputReg.type || null,
        status: inputReg.status || null,
      });
      logger.debug('Queued registration update', 'dogs', { registrationId: existing.id });
      changed = true;
      continue;
    }
    toCreate.push(inputReg);
  }

  if (toCreate.length > 0) {
    // Blank fields fall back inside the table exactly as the old direct insert did
    // (organization 'AKC', status 'pending').
    const inputs = toCreate.map(reg => ({
      organization: reg.organization ?? '',
      number: reg.number ?? '',
      registeredName: reg.registeredName,
      type: reg.type ?? '',
      status: reg.status ?? '',
    }));
    await replicatedDogRegistrationsTable.createRegistrationsForDog(dogId, inputs, options);
    logger.debug('Queued new registrations', 'dogs', { dogId, count: toCreate.length });
    changed = true;
  }

  return changed;
}
