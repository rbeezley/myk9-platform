import React, { useRef } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { Plus } from 'lucide-react';
import {
  POSITION_DISPLAY_NAMES,
  type PedigreePosition,
  type CreatePedigreeAncestorData,
} from '@/types/pedigree-types';
import PedigreeAncestorForm, {
  type AncestorFormValues,
  type PedigreeAncestorFormRef,
} from './PedigreeAncestorForm';

interface PedigreeAncestorAddDialogProps {
  open: boolean;
  position: PedigreePosition | null;
  dogId: string;
  ownerId: string;
  onClose: () => void;
  onAdd: (data: CreatePedigreeAncestorData) => void;
  /** True while the create mutation is in flight; disables the Save button. */
  isSaving?: boolean;
  /** Set when the create mutation was rejected; rendered as a retryable error. */
  saveError?: string | null;
}

const FORM_ID = 'add-ancestor-form';

const PedigreeAncestorAddDialog: React.FC<PedigreeAncestorAddDialogProps> = ({
  open,
  position,
  dogId,
  ownerId,
  onClose,
  onAdd,
  isSaving = false,
  saveError = null,
}) => {
  const formRef = useRef<PedigreeAncestorFormRef>(null);

  const handleSubmit = (values: AncestorFormValues) => {
    if (!position) return;

    const registrationNumbers: Record<string, string> = {};
    if (values.regOrg && values.regNumber) {
      registrationNumbers[values.regOrg] = values.regNumber;
    }

    onAdd({
      dog_id: dogId,
      owner_id: ownerId,
      position,
      linked_dog_id: null,
      registered_name: values.registeredName,
      call_name: values.callName || null,
      titles: values.titles || null,
      breed: values.breed || null,
      color: values.color || null,
      sex: values.sex || null,
      date_of_birth: values.dob || null,
      photo_url: values.photoUrl || null,
      registration_numbers: registrationNumbers,
      health_info: values.healthInfo || null,
    });
    // Do NOT reset here: the mutation runs asynchronously in the parent and
    // may fail. Values are only cleared on cancel/close or after the dialog
    // unmounts on confirmed success (StandardDialog unmounts on close).
  };

  const handleClose = () => {
    formRef.current?.reset();
    onClose();
  };

  return (
    <StandardDialog
      open={open}
      onClose={handleClose}
      onSave={() => {
        const form = document.getElementById(FORM_ID);
        if (form instanceof HTMLFormElement) form.requestSubmit();
      }}
      title={position ? `Add ${POSITION_DISPLAY_NAMES[position]}` : 'Add Ancestor'}
      description="Required fields are marked with *. Other fields are optional."
      formId={FORM_ID}
      isSubmitting={isSaving}
      saveLabel={
        <>
          <Plus className="mr-2 h-4 w-4" /> Add
        </>
      }
    >
      {saveError && (
        <p role="alert" aria-live="assertive" className="text-sm text-destructive mb-3">
          {saveError} The ancestor was not saved. Adjust the form and try again.
        </p>
      )}
      <PedigreeAncestorForm
        ref={formRef}
        formId={FORM_ID}
        initialValues={{ sex: position?.endsWith('sire') ? 'male' : 'female' }}
        hideSex
        onSubmit={handleSubmit}
      />
    </StandardDialog>
  );
};

export default PedigreeAncestorAddDialog;
