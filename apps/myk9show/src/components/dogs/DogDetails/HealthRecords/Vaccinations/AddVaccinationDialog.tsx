import React, { useEffect } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { FormField } from '@/components/common/FormField';
import { Input } from '@/components/ui/input';
import DatePickerField from '@/components/common/DatePickerField';
import { Plus } from 'lucide-react';
import { useFormValidation } from '@/hooks/useFormValidation';
import { z } from 'zod';

export interface VaccinationRecord {
  id?: number;
  vaccination: string;
  date: string;
  expiration: string;
  vetName: string;
}

const vaccinationSchema = z.object({
  vaccination: z.string().min(1, 'Please enter a vaccination name.'),
  date: z.string().min(1, 'Please select a date.'),
  expiration: z.string().min(1, 'Please select an expiration date.'),
  vetName: z.string().min(1, 'Please enter a veterinarian name.'),
});

type VaccinationFormData = z.infer<typeof vaccinationSchema>;

const initialData: VaccinationFormData = {
  vaccination: '',
  date: '',
  expiration: '',
  vetName: '',
};

interface AddVaccinationDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (record: VaccinationRecord) => void;
}

const AddVaccinationDialog: React.FC<AddVaccinationDialogProps> = ({ open, onClose, onAdd }) => {
  const form = useFormValidation(vaccinationSchema, initialData);

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
      title="Add Vaccination Record"
      description="All fields are required."
      saveLabel={
        <>
          <Plus className="mr-2 h-4 w-4" /> Add
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField
          label="Vaccination"
          fieldId="addVaccination"
          required
          error={form.getError('vaccination')}
        >
          <Input
            id="addVaccination"
            type="text"
            value={form.data.vaccination}
            onChange={e => form.setValue('vaccination', e.target.value)}
            onBlur={() => form.touchField('vaccination')}
            {...form.getFieldProps('vaccination')}
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
          label="Expiration Date"
          fieldId="expiration"
          required
          error={form.getError('expiration')}
        >
          <DatePickerField
            value={form.data.expiration}
            onChange={val => form.setValue('expiration', val)}
            required
          />
        </FormField>
        <FormField
          label="Veterinarian"
          fieldId="addVaccinationVet"
          required
          error={form.getError('vetName')}
        >
          <Input
            id="addVaccinationVet"
            type="text"
            value={form.data.vetName}
            onChange={e => form.setValue('vetName', e.target.value)}
            onBlur={() => form.touchField('vetName')}
            {...form.getFieldProps('vetName')}
          />
        </FormField>
      </div>
    </StandardDialog>
  );
};

export default AddVaccinationDialog;
