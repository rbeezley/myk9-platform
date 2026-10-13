import { useRegistrationsStore } from '@/store/registrationsStore';
import type { EditPanelSaveContext } from '@/components/panels/edit/EditPanelWrapper.types';
import { dogSaveFailure } from '@/hooks/translateDogDbError';
import type { useDogRegistrationManagement } from '@/hooks/queries/useRegistrationsDatabase';

export interface RegistrationFormData {
  organization: string;
  registeredName: string;
  breed: string;
  variety: string;
  registrationNumber: string;
  status: string;
  registrationDate: string;
}

function toDbRegistration(data: RegistrationFormData) {
  return {
    organization: data.organization,
    registered_name: data.registeredName,
    breed: data.breed,
    variety: data.variety || null,
    registration_number: data.registrationNumber,
    status: data.status,
    registration_date: data.registrationDate || null,
  };
}

type Mutations = Pick<
  ReturnType<typeof useDogRegistrationManagement>,
  'createRegistration' | 'updateRegistration'
>;

/**
 * The one save path for the registration Add and Edit forms, whether they are
 * the standalone panels (DogRegistrationDialogs) or a mode of the Manage
 * registrations panel (MYK9-1089).
 *
 * Both REJECT on failure: EditPanelWrapper.wrappedSave catches, reports, and
 * deliberately does not close, so the user keeps the form they typed. Add clears
 * itself on its next open, so a swallowed failure would throw the whole form
 * away and leave only a toast.
 */
export function useRegistrationFormSaves({ createRegistration, updateRegistration }: Mutations) {
  const setIsAddOpen = useRegistrationsStore(state => state.setIsAddRegistrationDialogOpen);
  const setIsEditOpen = useRegistrationsStore(state => state.setIsEditRegistrationDialogOpen);
  const setSelectedRegistration = useRegistrationsStore(state => state.setSelectedRegistration);

  const handleAdd = (data: RegistrationFormData, { isCurrent }: EditPanelSaveContext) =>
    new Promise<void>((resolve, reject) => {
      createRegistration(toDbRegistration(data), {
        onSuccess: () => {
          // Left while saving (MYK9-1125): the shared dialog state is no longer this save's.
          if (isCurrent()) setIsAddOpen(false);
          resolve();
        },
        onError: error => reject(dogSaveFailure(error)),
      });
    });

  const handleUpdate = (
    data: RegistrationFormData & { id: string },
    { isCurrent }: EditPanelSaveContext
  ) =>
    new Promise<void>((resolve, reject) => {
      updateRegistration(
        { id: data.id, updates: toDbRegistration(data) },
        {
          onSuccess: () => {
            if (isCurrent()) {
              setIsEditOpen(false);
              setSelectedRegistration(null);
            }
            resolve();
          },
          onError: error => reject(dogSaveFailure(error)),
        }
      );
    });

  return { handleAdd, handleUpdate };
}
