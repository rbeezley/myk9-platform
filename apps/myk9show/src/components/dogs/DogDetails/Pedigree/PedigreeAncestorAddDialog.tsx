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
}

const FORM_ID = 'add-ancestor-form';

const PedigreeAncestorAddDialog: React.FC<PedigreeAncestorAddDialogProps> = ({
  open,
  position,
  dogId,
  ownerId,
  onClose,
  onAdd,
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
    formRef.current?.reset();
  };

  const handleClose = () => {
    formRef.current?.reset();
    onClose();
  };

  return (
    <StandardDialog
      open={open}
      onClose={handleClose}
      onSave={() =>
        document
          .getElementById(FORM_ID)
          ?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
      }
      title={position ? `Add ${POSITION_DISPLAY_NAMES[position]}` : 'Add Ancestor'}
      description="Required fields are marked with *. Other fields are optional."
      formId={FORM_ID}
      saveLabel={
        <>
          <Plus className="mr-2 h-4 w-4" /> Add
        </>
      }
    >
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
