// Pure helper functions for useDogStoreCompat

import { updateRegistration, getRegistrationsByDog, createRegistration } from '@/services/database/queries/registrationQueries';
import { logger } from '@/services/LoggingService';
import type { DbDogRegistration } from '@/types/database-mappings';

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
  existingRegs: DbDogRegistration[],
): DbDogRegistration | undefined {
  return existingRegs.find(
    (er) => er.organization === inputReg.organization,
  );
}

/**
 * Updates or creates registrations for a dog.
 * Returns true if any registrations were changed.
 *
 * Does not throw — registration failures are logged but do not
 * fail the parent dog update.
 */
export async function syncDogRegistrations(
  dogId: string,
  registrations: RegistrationInput[],
): Promise<boolean> {
  if (registrations.length === 0) return false;

  let changed = false;

  const { data: existingRegs } = await getRegistrationsByDog(dogId);

  for (const inputReg of registrations) {
    if (!inputReg.registeredName) continue;

    const existing = findMatchingRegistration(inputReg, existingRegs ?? []);

    if (existing) {
      await updateRegistration(existing.id, {
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

    // Create new registration for this organization
    const { error: createError, data: newReg } = await createRegistration({
      dog_id: dogId,
      organization: inputReg.organization || 'AKC',
      registered_name: inputReg.registeredName,
      registration_number: inputReg.number || '',
      breed: inputReg.type || null,
      status: inputReg.status || 'pending',
    });

    if (createError) {
      logger.error('Failed to create registration', 'dogs', { dogId }, createError as Error);
      continue;
    }

    logger.debug('Created new registration', 'dogs', {
      registrationId: newReg?.id,
      registeredName: inputReg.registeredName,
      organization: inputReg.organization || 'AKC',
    });
    changed = true;
  }

  return changed;
}
