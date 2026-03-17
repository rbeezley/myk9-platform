import React, { useEffect } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { FormField } from '@/components/common/FormField';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';
import { useFormValidation } from '@/hooks/useFormValidation';
import { z } from 'zod';

export interface AllergyRecord {
  id?: number;
  name: string;
  description: string;
}

const allergySchema = z.object({
  name: z.string().min(1, 'Please enter an allergy name.'),
  description: z.string().min(1, 'Please enter a description.'),
});

type AllergyFormData = z.infer<typeof allergySchema>;

const initialData: AllergyFormData = {
  name: '',
  description: '',
};

interface AddAllergyDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (record: AllergyRecord) => void;
}

const AddAllergyDialog: React.FC<AddAllergyDialogProps> = ({ open, onClose, onAdd }) => {
  const form = useFormValidation(allergySchema, initialData);

  const resetForm = form.reset;
  useEffect(() => {
    if (open) resetForm(initialData);
  }, [open, resetForm]);

  const handleSave = form.handleSubmit(data => {
    onAdd(data);
    onClose();
  });

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={handleSave}
      title="Add Allergy"
      description="All fields are required."
      saveLabel={
        <>
          <Plus className="mr-2 h-4 w-4" /> Add
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField
          label="Allergy Name"
          fieldId="addAllergyName"
          required
          error={form.getError('name')}
        >
          <Input
            id="addAllergyName"
            type="text"
            value={form.data.name}
            onChange={e => form.setValue('name', e.target.value)}
            onBlur={() => form.touchField('name')}
            {...form.getFieldProps('name')}
          />
        </FormField>
        <FormField
          label="Description"
          fieldId="addAllergyDescription"
          required
          error={form.getError('description')}
        >
          <Textarea
            id="addAllergyDescription"
            value={form.data.description}
            onChange={e => form.setValue('description', e.target.value)}
            onBlur={() => form.touchField('description')}
            {...form.getFieldProps('description')}
          />
        </FormField>
      </div>
    </StandardDialog>
  );
};

export default AddAllergyDialog;
