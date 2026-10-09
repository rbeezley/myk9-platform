import { useState } from 'react';
import { toast } from 'sonner';
import { useQueuedRegistrationWrites } from '@/hooks/useQueuedRegistrationWrites';
import type { RegistrationAddFields } from '@/services/replication/ReplicatedDogRegistrationsTable';
import { dogSaveMessage } from '@/hooks/translateDogDbError';
import type { Registration } from '@/types/dog-types';

/** The add-panel registration as the queued INSERT's fields (MYK9-1071). */
export function toRegistrationAddFields(registration: Registration): RegistrationAddFields {
  return {
    organization: registration.organization,
    registeredName: registration.registeredName,
    registrationNumber: registration.registrationNumber,
    breed: registration.breed || null,
    variety: registration.variety || null,
    status: registration.status,
    applicationNumber: registration.applicationNumber || null,
    submissionDate: registration.submissionDate || null,
    registrationDate: registration.registrationDate || null,
    certificate: registration.certificate || null,
  };
}

/** Queues the registration (MYK9-1071) while keeping wizard context in place. */
export function useInlineDogRegistration(onSaved?: () => void) {
  const [registrationDogId, setRegistrationDogId] = useState<string | null>(null);
  const { addRegistration } = useQueuedRegistrationWrites();

  const saveRegistration = async (registration: Registration): Promise<boolean> => {
    if (!registrationDogId) return false;

    try {
      await addRegistration(registrationDogId, toRegistrationAddFields(registration));
      toast.success('Registration added');
      setRegistrationDogId(null);
      onSaved?.();
      return true;
    } catch (error) {
      toast.error(dogSaveMessage(error));
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
