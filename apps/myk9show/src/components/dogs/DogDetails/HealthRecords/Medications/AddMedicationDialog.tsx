import React, { useEffect } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { FormField } from '@/components/common/FormField';
import { Input } from '@/components/ui/input';
import DatePickerField from '@/components/common/DatePickerField';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';
import { useFormValidation } from '@/hooks/useFormValidation';
import { z } from 'zod';

export interface MedicationRecord {
  id?: number;
  name: string;
  dosage: string;
  notes: string;
  frequency: string;
  expiration: string;
}

const medicationSchema = z.object({
  name: z.string().min(1, 'Please enter a medication name.'),
  dosage: z.string().min(1, 'Please enter a dosage.'),
  notes: z.string(),
  frequency: z.string(),
  expiration: z.string().min(1, 'Please select a next due date.'),
});

type MedicationFormData = z.infer<typeof medicationSchema>;

const initialData: MedicationFormData = {
  name: '',
  dosage: '',
  notes: '',
  frequency: '',
  expiration: '',
};

interface AddMedicationDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (record: MedicationRecord) => void;
}

const AddMedicationDialog: React.FC<AddMedicationDialogProps> = ({ open, onClose, onAdd }) => {
  const form = useFormValidation(medicationSchema, initialData);

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
      title="Add Medication"
      description="All fields except Notes are required."
      saveLabel={
        <>
          <Plus className="mr-2 h-4 w-4" /> Add
        </>
      }
    >
      {/*
  Two-column grid layout for medication fields:
  - Name, Dosage, Frequency, Next Due each get their own cell
  - Notes spans both columns for full width
  - Consistent gap between fields, responsive width
*/}
      <div className="py-4 min-w-[350px] max-w-[500px] mx-auto">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Name" fieldId="medicationName" required error={form.getError('name')}>
            <Input
              id="medicationName"
              value={form.data.name}
              onChange={e => form.setValue('name', e.target.value)}
              onBlur={() => form.touchField('name')}
              {...form.getFieldProps('name')}
              className={form.getError('name') ? 'border-destructive' : ''}
            />
          </FormField>
          <FormField label="Dosage" fieldId="dosage" required error={form.getError('dosage')}>
            <Input
              id="dosage"
              value={form.data.dosage}
              onChange={e => form.setValue('dosage', e.target.value)}
              onBlur={() => form.touchField('dosage')}
              {...form.getFieldProps('dosage')}
              className={form.getError('dosage') ? 'border-destructive' : ''}
            />
          </FormField>
          <FormField label="Frequency" fieldId="frequency">
            <Input
              id="frequency"
              value={form.data.frequency}
              onChange={e => form.setValue('frequency', e.target.value)}
            />
          </FormField>
          <FormField
            label="Next Due"
            fieldId="expiration"
            required
            error={form.getError('expiration')}
          >
            <DatePickerField
              value={form.data.expiration}
              onChange={val => form.setValue('expiration', val)}
              required
              className="space-y-0"
            />
          </FormField>
          <FormField label="Notes" fieldId="notes" className="col-span-2">
            <Textarea
              id="notes"
              value={form.data.notes}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                form.setValue('notes', e.target.value)
              }
            />
          </FormField>
        </div>
      </div>
    </StandardDialog>
  );
};

export default AddMedicationDialog;
