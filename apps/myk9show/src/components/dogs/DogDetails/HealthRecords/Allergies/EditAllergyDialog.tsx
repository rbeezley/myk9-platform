import React, { useState, useEffect } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
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

  useEffect(() => {
    if (record) {
      setName(record.name);
      setDescription(record.description);
    }
  }, [record]);

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
        <div>
          <label className="block mb-1 font-medium">Allergy Name <span className="text-red-500">*</span></label>
          <Input type="text" value={""} onChange={e => setName(e.target.value)} required />
        </div>
        <div>
          <label className="block mb-1 font-medium">Description <span className="text-red-500">*</span></label>
          <Textarea value={""} onChange={e => setDescription(e.target.value)} required />
        </div>
      </form>
    </StandardDialog>
  );
};

export default EditAllergyDialog;
