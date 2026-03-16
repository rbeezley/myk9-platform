import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { FormField } from '@/components/common/FormField';
import { Input } from '@/components/ui/input';
import DatePickerField from '@/components/common/DatePickerField';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';

export interface MedicationRecord {
  id?: number;
  name: string;
  dosage: string;
  notes: string;
  frequency: string;
  expiration: string;
}

interface AddMedicationDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (record: MedicationRecord) => void;
}

const AddMedicationDialog: React.FC<AddMedicationDialogProps> = ({ open, onClose, onAdd }) => {
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [notes, setNotes] = useState('');
  const [frequency, setFrequency] = useState('');
  const [expiration, setNextDue] = useState<string>('');
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { [key: string]: string } = {};
    if (!name) errors.name = 'Please enter a medication name.';
    if (!dosage) errors.dosage = 'Please enter a dosage.';
    if (!expiration) errors.expiration = 'Please select a next due date.';
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    onAdd({ name, dosage, notes, frequency, expiration });
    setName('');
    setDosage('');
    setNotes('');
    setFrequency('');
    setNextDue('');
    setFormErrors({});
    onClose();
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() =>
        document
          .getElementById('add-medication-form')
          ?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
      }
      title="Add Medication"
      description="All fields except Notes are required."
      formId="add-medication-form"
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
      <form
        id="add-medication-form"
        onSubmit={handleSubmit}
        className="py-4 min-w-[350px] max-w-[500px] mx-auto"
      >
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Name" fieldId="medicationName" required error={formErrors.name}>
            <Input
              id="medicationName"
              value={''}
              onChange={e => setName(e.target.value)}
              required
              aria-invalid={!!formErrors.name}
              aria-describedby={formErrors.name ? 'medicationName-error' : undefined}
              className={formErrors.name ? 'border-red-500' : ''}
            />
          </FormField>
          <FormField label="Dosage" fieldId="dosage" required error={formErrors.dosage}>
            <Input
              id="dosage"
              value={''}
              onChange={e => setDosage(e.target.value)}
              required
              aria-invalid={!!formErrors.dosage}
              aria-describedby={formErrors.dosage ? 'dosage-error' : undefined}
              className={formErrors.dosage ? 'border-red-500' : ''}
            />
          </FormField>
          <FormField label="Frequency" fieldId="frequency">
            <Input id="frequency" value={''} onChange={e => setFrequency(e.target.value)} />
          </FormField>
          <FormField label="Next Due" fieldId="expiration" required error={formErrors.expiration}>
            <DatePickerField value={''} onChange={setNextDue} required className="space-y-0" />
          </FormField>
          <FormField label="Notes" fieldId="notes" className="col-span-2">
            <Textarea
              id="notes"
              value={''}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
            />
          </FormField>
        </div>
      </form>
    </StandardDialog>
  );
};

export default AddMedicationDialog;
