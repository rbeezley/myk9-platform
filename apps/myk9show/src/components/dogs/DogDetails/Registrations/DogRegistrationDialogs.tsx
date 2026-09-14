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
import { useEffect, useState } from 'react';
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

/** SlideOverPanel keeps a closed panel mounted this long for its exit slide. */
const PANEL_CLOSE_MS = 350;

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

  // EditPanelWrapper resets only when `initialData`'s VALUE changes, and Add's is
  // a module constant — so a panel that no longer unmounts between uses reopens
  // holding the registration just saved, inviting a duplicate row. Remount it
  // AFTER the close animation: remounting at the moment of opening would seed
  // `prevOpen` from `open` and skip the slide-in.
  const [addPanelKey, setAddPanelKey] = useState(0);
  useEffect(() => {
    if (isAddOpen) return;
    const timer = setTimeout(() => setAddPanelKey(key => key + 1), PANEL_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [isAddOpen]);

  // The delete confirmation is a plain dialog with no error surface of its own,
  // so its failures need a toast.
  const reportSaveError = (error: unknown) => toast.error(translateDogDbError(error).message);

  // Add and Edit REJECT instead: EditPanelWrapper.wrappedSave catches, reports,
  // and deliberately does not close, so the user keeps the form they typed. The
  // panels are keyed to remount blank, so a swallowed failure would throw the
  // whole form away and leave only a toast.
  const handleAdd = (data: RegistrationFormData) =>
    new Promise<void>((resolve, reject) => {
      createRegistration(toDbRegistration(data), {
        onSuccess: () => {
          setIsAddOpen(false);
          resolve();
        },
        onError: error => reject(new Error(translateDogDbError(error).message)),
      });
    });

  const handleUpdate = (data: RegistrationFormData & { id: string }) =>
    new Promise<void>((resolve, reject) => {
      updateRegistration(
        { id: data.id, updates: toDbRegistration(data) },
        {
          onSuccess: () => {
            setIsEditOpen(false);
            setSelectedRegistration(null);
            resolve();
          },
          onError: error => reject(new Error(translateDogDbError(error).message)),
        }
      );
    });

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
        key={addPanelKey}
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
