import { useState } from 'react';
import { toast } from 'sonner';
import { useCreateRegistrationMutation } from '@/hooks/queries/useRegistrationsDatabase';
import { dogSaveMessage } from '@/hooks/translateDogDbError';
import type { Registration } from '@/types/dog-types';
import {
  formDataToRegistration,
  type RegistrationFormData,
} from '@/components/dogs/registrationForm';
import { PanelSaveHandledError } from '@/components/panels/edit/panelSaveErrors';
import type { RegistrationDraft } from '@/services/replication/ReplicatedDogRegistrationsTable';

export function toDogRegistrationInsert(
  dogId: string,
  registration: Registration
): RegistrationDraft {
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

/** Reuses the canonical (queued) registration add while keeping wizard context in place. */
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
      toast.error(dogSaveMessage(error));
      return false;
    }
  };

  /**
   * `saveRegistration` for the registration panel: it rejects when the save
   * failed so the panel stays open, and says nothing more because
   * `saveRegistration` has already toasted.
   */
  const saveRegistrationForm = async (data: RegistrationFormData): Promise<void> => {
    if (!(await saveRegistration(formDataToRegistration(data)))) throw new PanelSaveHandledError();
  };

  return {
    registrationDogId,
    openRegistrationEditor: setRegistrationDogId,
    closeRegistrationEditor: () => setRegistrationDogId(null),
    saveRegistration,
    saveRegistrationForm,
  };
}
