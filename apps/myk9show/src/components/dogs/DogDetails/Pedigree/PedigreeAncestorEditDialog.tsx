import React, { useMemo, useRef } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { POSITION_DISPLAY_NAMES, type PedigreeAncestor } from '@/types/pedigree-types';
import PedigreeAncestorForm, {
  type AncestorFormValues,
  type PedigreeAncestorFormRef,
} from './PedigreeAncestorForm';

interface EditAncestorDialogProps {
  open: boolean;
  ancestor: PedigreeAncestor | null;
  onClose: () => void;
  onSave: (ancestor: PedigreeAncestor) => void;
}

const FORM_ID = 'edit-ancestor-form';

function ancestorToFormValues(ancestor: PedigreeAncestor): Partial<AncestorFormValues> {
  const regEntries = Object.entries(ancestor.registration_numbers);
  return {
    registeredName: ancestor.registered_name,
    callName: ancestor.call_name || '',
    titles: ancestor.titles || '',
    breed: ancestor.breed || '',
    color: ancestor.color || '',
    sex: ancestor.sex || '',
    dob: ancestor.date_of_birth || '',
    photoUrl: ancestor.photo_url || '',
    healthInfo: ancestor.health_info || '',
    regOrg: regEntries[0]?.[0] || '',
    regNumber: regEntries[0]?.[1] || '',
  };
}

const EditAncestorDialog: React.FC<EditAncestorDialogProps> = ({
  open,
  ancestor,
  onClose,
  onSave,
}) => {
  const formRef = useRef<PedigreeAncestorFormRef>(null);

  // Re-derive initial values when ancestor changes
  const initialValues = useMemo(
    () => (ancestor ? ancestorToFormValues(ancestor) : undefined),
    [ancestor]
  );

  const handleSubmit = (values: AncestorFormValues) => {
    if (!ancestor) return;

    const registrationNumbers: Record<string, string> = {};
    if (values.regOrg && values.regNumber) {
      registrationNumbers[values.regOrg] = values.regNumber;
    }

    onSave({
      ...ancestor,
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
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() =>
        document
          .getElementById(FORM_ID)
          ?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
      }
      title={ancestor ? `Edit ${POSITION_DISPLAY_NAMES[ancestor.position]}` : 'Edit Ancestor'}
      description={
        <span className="text-xs text-muted-foreground">
          <span className="text-destructive">*</span> Required field. Position cannot be changed.
        </span>
      }
      saveLabel="Save"
      cancelLabel="Cancel"
      formId={FORM_ID}
    >
      {ancestor && (
        <PedigreeAncestorForm
          key={ancestor.id}
          ref={formRef}
          formId={FORM_ID}
          initialValues={initialValues}
          hideSex
          onSubmit={handleSubmit}
        />
      )}
    </StandardDialog>
  );
};

export default EditAncestorDialog;
