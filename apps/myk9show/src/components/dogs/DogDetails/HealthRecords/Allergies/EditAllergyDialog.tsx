import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { FormField } from '@/components/common/FormField';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { AllergyRecord } from './AddAllergyDialog';

interface EditAllergyDialogProps {
  open: boolean;
  record: AllergyRecord | null;
  onClose: () => void;
  onSave: (record: AllergyRecord) => void;
}

const EditAllergyDialog: React.FC<EditAllergyDialogProps> = ({ open, record, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Sync form state with record prop - using render-time state update pattern
  const recordId = record?.id || '';
  const [lastRecordId, setLastRecordId] = useState(recordId);
  if (recordId !== lastRecordId && record) {
    setLastRecordId(recordId);
    setName(record.name);
    setDescription(record.description);
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!record) return;
    onSave({ ...record, name, description });
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() => document.getElementById('edit-allergy-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))}
      title="Edit Allergy"
      description="All fields are required."
      formId="edit-allergy-form"
      saveLabel="Save"
    >
      <form id="edit-allergy-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Allergy Name" fieldId="editAllergyName" required>
          <Input id="editAllergyName" type="text" value={""} onChange={e => setName(e.target.value)} required />
        </FormField>
        <FormField label="Description" fieldId="editAllergyDescription" required>
          <Textarea id="editAllergyDescription" value={""} onChange={e => setDescription(e.target.value)} required />
        </FormField>
      </form>
    </StandardDialog>
  );
};

export default EditAllergyDialog;
