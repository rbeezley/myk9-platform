import { useState } from 'react';
import { toast } from 'sonner';
import { useCreateRegistrationMutation } from '@/hooks/queries/useRegistrationsDatabase';
import { translateDogDbError } from '@/hooks/translateDogDbError';
import type { Registration } from '@/types/dog-types';
import type { DbDogRegistrationInsert } from '@/types/database-mappings';

export function toDogRegistrationInsert(
  dogId: string,
  registration: Registration
): DbDogRegistrationInsert {
  return {
    dog_id: dogId,
    organization: registration.organization,
    registered_name: registration.registeredName,
    registration_number: registration.registrationNumber,
    breed: registration.breed || null,
    variety: registration.variety || null,
    status: registration.status,
    application_number: registration.applicationNumber || null,
    submission_date: registration.submissionDate || null,
    registration_date: registration.registrationDate || null,
    certificate: registration.certificate || null,
  };
}

/** Reuses the canonical registration mutation while keeping wizard context in place. */
export function useInlineDogRegistration(onSaved?: () => void) {
  const [registrationDogId, setRegistrationDogId] = useState<string | null>(null);
  const createRegistration = useCreateRegistrationMutation();

  const saveRegistration = async (registration: Registration): Promise<boolean> => {
    if (!registrationDogId) return false;

    try {
      await createRegistration.mutateAsync(
        toDogRegistrationInsert(registrationDogId, registration)
      );
      toast.success('Registration added');
      setRegistrationDogId(null);
      onSaved?.();
      return true;
    } catch (error) {
      toast.error(translateDogDbError(error).message);
      return false;
    }
  };

  return {
    registrationDogId,
    openRegistrationEditor: setRegistrationDogId,
    closeRegistrationEditor: () => setRegistrationDogId(null),
    saveRegistration,
  };
}
