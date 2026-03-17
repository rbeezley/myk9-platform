import React, { useEffect } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { FormField } from '@/components/common/FormField';
import { Input } from '@/components/ui/input';
import DatePickerField from '@/components/common/DatePickerField';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';
import { useFormValidation } from '@/hooks/useFormValidation';
import { z } from 'zod';

export interface VetVisitRecord {
  id?: number;
  title: string;
  date: string;
  notes: string;
  vetName: string;
  clinicName: string;
}

const vetVisitSchema = z.object({
  title: z.string().min(1, 'Please enter a title.'),
  date: z.string().min(1, 'Please select a date.'),
  notes: z.string().min(1, 'Please enter notes.'),
  vetName: z.string().min(1, 'Please enter a vet name.'),
  clinicName: z.string().min(1, 'Please enter a clinic name.'),
});

type VetVisitFormData = z.infer<typeof vetVisitSchema>;

const initialData: VetVisitFormData = {
  title: '',
  date: '',
  notes: '',
  vetName: '',
  clinicName: '',
};

interface AddVetVisitDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (record: VetVisitRecord) => void;
}

const AddVetVisitDialog: React.FC<AddVetVisitDialogProps> = ({ open, onClose, onAdd }) => {
  const form = useFormValidation(vetVisitSchema, initialData);

  useEffect(() => {
    if (open) form.reset(initialData);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = form.handleSubmit(data => {
    onAdd(data);
    onClose();
  });

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={handleSave}
      title="Add Vet Visit"
      description="All fields are required."
      saveLabel={
        <>
          <Plus className="mr-2 h-4 w-4" /> Add
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Title" fieldId="addVetVisitTitle" required error={form.getError('title')}>
          <Input
            id="addVetVisitTitle"
            type="text"
            value={form.data.title}
            onChange={e => form.setValue('title', e.target.value)}
            onBlur={() => form.touchField('title')}
            {...form.getFieldProps('title')}
          />
        </FormField>
        <FormField label="Date" fieldId="date" required error={form.getError('date')}>
          <DatePickerField
            value={form.data.date}
            onChange={val => form.setValue('date', val)}
            required
          />
        </FormField>
        <FormField
          label="Vet Name"
          fieldId="addVetVisitVetName"
          required
          error={form.getError('vetName')}
        >
          <Input
            id="addVetVisitVetName"
            type="text"
            value={form.data.vetName}
            onChange={e => form.setValue('vetName', e.target.value)}
            onBlur={() => form.touchField('vetName')}
            {...form.getFieldProps('vetName')}
          />
        </FormField>
        <FormField
          label="Clinic Name"
          fieldId="addVetVisitClinicName"
          required
          error={form.getError('clinicName')}
        >
          <Input
            id="addVetVisitClinicName"
            type="text"
            value={form.data.clinicName}
            onChange={e => form.setValue('clinicName', e.target.value)}
            onBlur={() => form.touchField('clinicName')}
            {...form.getFieldProps('clinicName')}
          />
        </FormField>
        <FormField label="Notes" fieldId="addVetVisitNotes" required error={form.getError('notes')}>
          <Textarea
            id="addVetVisitNotes"
            value={form.data.notes}
            onChange={e => form.setValue('notes', e.target.value)}
            onBlur={() => form.touchField('notes')}
            {...form.getFieldProps('notes')}
          />
        </FormField>
      </div>
    </StandardDialog>
  );
};

export default AddVetVisitDialog;
