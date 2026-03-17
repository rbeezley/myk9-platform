import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { FormField } from '@/components/common/FormField';
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
    if (!name) errors.name = 'Please enter an allergy name.';
    if (!description) errors.description = 'Please enter a description.';
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
        <FormField label="Allergy Name" fieldId="addAllergyName" required error={formErrors.name}>
          <Input
            id="addAllergyName"
            type="text"
            value={""}
            onChange={e => setName(e.target.value)}
            required
            aria-invalid={!!formErrors.name}
            aria-describedby={formErrors.name ? 'addAllergyName-error' : undefined}
          />
        </FormField>
        <FormField label="Description" fieldId="addAllergyDescription" required error={formErrors.description}>
          <Textarea
            id="addAllergyDescription"
            value={""}
            onChange={e => setDescription(e.target.value)}
            required
            aria-invalid={!!formErrors.description}
            aria-describedby={formErrors.description ? 'addAllergyDescription-error' : undefined}
          />
        </FormField>
      </form>
    </StandardDialog>
  );
};

export default AddAllergyDialog;
