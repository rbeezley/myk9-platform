/**
 * The dog's registration Add / Edit / Delete panels, plus the mutations behind
 * them, mounted ONCE per Dog Details page.
 *
 * They used to live inside RegistrationsSection, which made the list a
 * prerequisite for the panels: the rail's "Add registration" only worked while
 * an Overview copy of the list was mounted, and keeping that copy mounted-but-
 * hidden is what MYK9-518's first eight review rounds were all about. Hosting
 * the panels here lets the list be an ordinary list, shown only where it is
 * wanted (the secretary view, and the exhibitor's Manage registrations panel).
 *
 * Opening is driven by `registrationsStore`, so any surface can raise a panel
 * without owning one.
 */
import { useEffect } from 'react';
import { toast } from 'sonner';
import type { Dog } from '@/types/dog-types';
import AddRegistrationPanel from './AddRegistrationPanel';
import EditRegistrationPanel from './EditRegistrationPanel';
import ConfirmDeleteRegistrationDialog from './ConfirmDeleteRegistrationDialog';
import { useDogRegistrationManagement } from '@/hooks/queries/useRegistrationsDatabase';
import { useRegistrationsStore } from '@/store/registrationsStore';
import { translateDogDbError } from '@/hooks/translateDogDbError';

interface DogRegistrationDialogsProps {
  dog?: Dog | undefined;
  /** One-shot request from the rail button or the `?addRegistration=true` link. */
  autoOpenAddDialog?: boolean;
  onAddRequestConsumed?: (() => void) | undefined;
}

interface RegistrationFormData {
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

export default function DogRegistrationDialogs({
  dog,
  autoOpenAddDialog = false,
  onAddRequestConsumed,
}: DogRegistrationDialogsProps) {
  const { createRegistration, updateRegistration, deleteRegistration } =
    useDogRegistrationManagement(dog?.id || '');

  const isAddOpen = useRegistrationsStore(state => state.isAddRegistrationDialogOpen);
  const setIsAddOpen = useRegistrationsStore(state => state.setIsAddRegistrationDialogOpen);
  const isEditOpen = useRegistrationsStore(state => state.isEditRegistrationDialogOpen);
  const setIsEditOpen = useRegistrationsStore(state => state.setIsEditRegistrationDialogOpen);
  const isDeleteOpen = useRegistrationsStore(state => state.isDeleteRegistrationDialogOpen);
  const setIsDeleteOpen = useRegistrationsStore(state => state.setIsDeleteRegistrationDialogOpen);
  const selectedRegistration = useRegistrationsStore(state => state.selectedRegistration);
  const setSelectedRegistration = useRegistrationsStore(state => state.setSelectedRegistration);

  useEffect(() => {
    if (!autoOpenAddDialog) return;
    setIsAddOpen(true);
    onAddRequestConsumed?.();
  }, [autoOpenAddDialog, onAddRequestConsumed, setIsAddOpen]);

  // registrationsStore is module-global and this host is mounted on every dog
  // page. Without this, Back-ing out of an open Edit on dog A and opening dog B
  // re-opens that panel holding A's registration under B's name — and saving
  // writes to A's row. Clear the panel state whenever the dog changes or the
  // page unmounts.
  const dogId = dog?.id;
  useEffect(() => {
    return () => {
      setIsAddOpen(false);
      setIsEditOpen(false);
      setIsDeleteOpen(false);
      setSelectedRegistration(null);
    };
  }, [dogId, setIsAddOpen, setIsEditOpen, setIsDeleteOpen, setSelectedRegistration]);

  // Keyed per open so the form starts blank — see addRegistrationOpenCount.
  const addOpenCount = useRegistrationsStore(state => state.addRegistrationOpenCount);

  // A save failure is transient feedback about an action the user just took, and
  // the panel that failed may be the only thing on screen — a toast reaches them
  // wherever this host happens to be mounted.
  const reportSaveError = (error: unknown) => toast.error(translateDogDbError(error).message);

  const handleAdd = async (data: RegistrationFormData) => {
    createRegistration(toDbRegistration(data), {
      onSuccess: () => setIsAddOpen(false),
      onError: reportSaveError,
    });
  };

  const handleUpdate = async (data: RegistrationFormData & { id: string }) => {
    updateRegistration(
      { id: data.id, updates: toDbRegistration(data) },
      {
        onSuccess: () => {
          setIsEditOpen(false);
          setSelectedRegistration(null);
        },
        onError: reportSaveError,
      }
    );
  };

  const handleDelete = () => {
    // Same onError as add and update: the optimistic update targets a different
    // query key, so a rejected delete leaves the row on screen and would
    // otherwise say nothing at all.
    if (selectedRegistration?.id) {
      deleteRegistration(selectedRegistration.id, { onError: reportSaveError });
    }
    setIsDeleteOpen(false);
    setSelectedRegistration(null);
  };

  return (
    <>
      <AddRegistrationPanel
        key={addOpenCount}
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSave={handleAdd}
        dogName={dog?.callName}
      />
      <EditRegistrationPanel
        open={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
          setSelectedRegistration(null);
        }}
        onSave={handleUpdate}
        registration={selectedRegistration}
        dogName={dog?.callName}
      />
      <ConfirmDeleteRegistrationDialog
        open={isDeleteOpen}
        onClose={() => {
          setIsDeleteOpen(false);
          setSelectedRegistration(null);
        }}
        onDelete={handleDelete}
        registration={selectedRegistration}
      />
    </>
  );
}
