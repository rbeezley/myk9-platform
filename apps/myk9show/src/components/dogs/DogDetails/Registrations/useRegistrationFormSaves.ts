import { useRegistrationsStore } from '@/store/registrationsStore';
import { dogSaveFailure } from '@/hooks/translateDogDbError';
import type { RegistrationFormData } from '@/components/dogs/registrationForm';
import type { useDogRegistrationManagement } from '@/hooks/queries/useRegistrationsDatabase';

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

  const handleAdd = (data: RegistrationFormData) =>
    new Promise<void>((resolve, reject) => {
      createRegistration(toDbRegistration(data), {
        onSuccess: () => {
          setIsAddOpen(false);
          resolve();
        },
        onError: error => reject(dogSaveFailure(error)),
      });
    });

  const handleUpdate = (data: RegistrationFormData) =>
    new Promise<void>((resolve, reject) => {
      updateRegistration(
        { id: data.id, updates: toDbRegistration(data) },
        {
          onSuccess: () => {
            setIsEditOpen(false);
            setSelectedRegistration(null);
            resolve();
          },
          onError: error => reject(dogSaveFailure(error)),
        }
      );
    });

  return { handleAdd, handleUpdate };
}
