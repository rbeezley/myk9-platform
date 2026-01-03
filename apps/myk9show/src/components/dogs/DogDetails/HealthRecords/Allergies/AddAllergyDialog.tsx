import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import RequiredLabel from '@/components/common/RequiredLabel';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';

export interface AllergyRecord {
  id?: number;
  name: string;
  description: string;
}

interface AddAllergyDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (record: AllergyRecord) => void;
}

const AddAllergyDialog: React.FC<AddAllergyDialogProps> = ({ open, onClose, onAdd }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { [key: string]: string } = {};
    if (!name) errors.name = 'Allergy Name is required.';
    if (!description) errors.description = 'Description is required.';
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    onAdd({ name, description });
    setName('');
    setDescription('');
    setFormErrors({});
    onClose();
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() => document.getElementById('add-allergy-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))}
      title="Add Allergy"
      description="All fields are required."
      formId="add-allergy-form"
      saveLabel={<><Plus className="mr-2 h-4 w-4" /> Add</>}
    >
      <form id="add-allergy-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <RequiredLabel required>Allergy Name</RequiredLabel>
          <Input type="text" value={""} onChange={e => setName(e.target.value)} required className={formErrors.name ? 'border-red-500' : ''} />
          {formErrors.name && <div className="text-red-500 text-xs mt-1">{formErrors.name}</div>}
        </div>
        <div>
          <RequiredLabel required>Description</RequiredLabel>
          <Textarea value={""} onChange={e => setDescription(e.target.value)} required className={formErrors.description ? 'border-red-500' : ''} />
          {formErrors.description && <div className="text-red-500 text-xs mt-1">{formErrors.description}</div>}
        </div>
      </form>
    </StandardDialog>
  );
};

export default AddAllergyDialog;
