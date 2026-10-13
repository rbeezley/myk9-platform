/**
 * The exhibitor's registration editing surface, as a panel raised from the
 * identity rail.
 *
 * Registrations are consulted rarely (MYK9-478), so they get no standing room
 * on Overview — the rail carries the summary, and this holds the edit and
 * delete controls until they are asked for. A panel rather than an in-page
 * disclosure on purpose: no reveal state to place, no history contract, no
 * focus choreography, and no layout rule for the hidden case.
 *
 * Add and Edit are MODES of this one panel (MYK9-1089), never a second slide-out
 * stacked on it: the body swaps from the list to the form, the header gains Back,
 * and DogRegistrationDialogs stands down while this panel is open. Escape, the
 * backdrop, X and Back all leave the mode first; a second Escape closes the
 * panel. A dirty form answers each of them with the discard prompt.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { Dog } from '@/types/dog-types';
import { useRegistrationsStore } from '@/store/registrationsStore';
import { useDogRegistrationManagement } from '@/hooks/queries/useRegistrationsDatabase';
import SlideOverPanel from '@/components/panels/SlideOverPanel';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import RegistrationsSection from './RegistrationsSection';
import AddRegistrationPanel from './AddRegistrationPanel';
import EditRegistrationPanel from './EditRegistrationPanel';
import { useRegistrationFormSaves } from './useRegistrationFormSaves';
import { usePanelModeFocus } from '@/components/panels/usePanelModeFocus';
import { EDIT_REGISTRATION_ATTR } from './useRegistrationModeFocus';

interface ManageRegistrationsPanelProps {
  open: boolean;
  onClose: () => void;
  dog: Dog;
}

export default function ManageRegistrationsPanel({
  open,
  onClose,
  dog,
}: ManageRegistrationsPanelProps) {
  const isAddOpen = useRegistrationsStore(state => state.isAddRegistrationDialogOpen);
  const setIsAddOpen = useRegistrationsStore(state => state.setIsAddRegistrationDialogOpen);
  const isEditOpen = useRegistrationsStore(state => state.isEditRegistrationDialogOpen);
  const setIsEditOpen = useRegistrationsStore(state => state.setIsEditRegistrationDialogOpen);
  const selectedRegistration = useRegistrationsStore(state => state.selectedRegistration);
  const setSelectedRegistration = useRegistrationsStore(state => state.setSelectedRegistration);

  const { createRegistration, updateRegistration } = useDogRegistrationManagement(dog.id);
  const { handleAdd, handleUpdate } = useRegistrationFormSaves({
    createRegistration,
    updateRegistration,
  });

  // The store's flags are the single source of truth for the mode, so the rail
  // and the list raise Add / Edit the same way whichever surface hosts them.
  const mode = isAddOpen ? 'add' : isEditOpen ? 'edit' : 'list';
  const listRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const closeFormRef = useRef<(() => void) | null>(null);
  // leaveMode clears the selection together with the mode, so remember which
  // row was edited to put focus back on its Edit button.
  const selectedId = selectedRegistration?.id ?? null;
  const lastEditedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedId) lastEditedIdRef.current = selectedId;
  }, [selectedId]);
  // The control that opened Add or Edit unmounts when the panel swaps to the
  // form: that row's Edit button after an Edit, the header Add after an Add.
  const returnTarget = useCallback((left: 'list' | 'add' | 'edit') => {
    const editedId = lastEditedIdRef.current;
    const row =
      left === 'edit' && editedId
        ? listRef.current?.querySelector<HTMLElement>(
            `[${EDIT_REGISTRATION_ATTR}="${CSS.escape(editedId)}"]`
          )
        : null;
    return row ?? addButtonRef.current;
  }, []);
  usePanelModeFocus({ mode, home: 'list', formRef, returnTarget });

  function leaveMode() {
    setIsAddOpen(false);
    setIsEditOpen(false);
    setSelectedRegistration(null);
  }

  // Escape, the backdrop, X and Back all land here. In a mode they ask the form
  // to close (which raises the discard prompt when dirty); on the list they
  // close the panel.
  function handlePanelClose() {
    if (mode === 'list') onClose();
    else closeFormRef.current?.();
  }

  const title =
    mode === 'add' ? 'Add Registration' : mode === 'edit' ? 'Edit Registration' : 'Registrations';

  return (
    <SlideOverPanel
      open={open}
      onClose={handlePanelClose}
      title={title}
      {...(dog.callName ? { subtitle: dog.callName } : {})}
      size="lg"
      {...(mode === 'list'
        ? {
            // The rail's Add sits behind this backdrop, so the panel carries its
            // own for the loaded-list and error states as well as the empty one.
            headerActions: (
              <Button ref={addButtonRef} size="sm" onClick={() => setIsAddOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            ),
          }
        : { showBackButton: true, onBack: handlePanelClose })}
    >
      {mode === 'list' && (
        <div ref={listRef}>
          {/* Mounted only behind canManageDogRegistrations (DogDetailsMain). */}
          <RegistrationsSection dog={dog} canEdit />
        </div>
      )}
      {mode !== 'list' && (
        <div ref={formRef} tabIndex={-1} className="h-full outline-none">
          {mode === 'add' ? (
            <AddRegistrationPanel
              open
              variant="inline"
              closeRequestRef={closeFormRef}
              onClose={leaveMode}
              onSave={handleAdd}
              dogName={dog.callName}
            />
          ) : (
            <EditRegistrationPanel
              open
              variant="inline"
              closeRequestRef={closeFormRef}
              onClose={leaveMode}
              onSave={handleUpdate}
              registration={selectedRegistration}
              dogName={dog.callName}
            />
          )}
        </div>
      )}
    </SlideOverPanel>
  );
}
