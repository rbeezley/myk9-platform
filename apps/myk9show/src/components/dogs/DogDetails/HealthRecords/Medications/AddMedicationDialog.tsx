import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import RequiredLabel from '@/components/common/RequiredLabel';
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
  const [expiration, setNextDue] = useState<string>("");
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { [key: string]: string } = {};
    if (!name) errors.name = 'Name is required.';
    if (!dosage) errors.dosage = 'Dosage is required.';
    if (!expiration) errors.expiration = 'Next Due date is required.';
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    onAdd({ name, dosage, notes, frequency, expiration });
    setName('');
    setDosage('');
    setNotes('');
    setFrequency('');
    setNextDue("");
    setFormErrors({});
    onClose();
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() => document.getElementById('add-medication-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))}
      title="Add Medication"
      description="All fields except Notes are required."
      formId="add-medication-form"
      saveLabel={<><Plus className="mr-2 h-4 w-4" /> Add</>}
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
    <div className="flex flex-col">
      <RequiredLabel required>Name</RequiredLabel>
      <Input
        id="medicationName"
        value={""}
        onChange={e => setName(e.target.value)}
        required
        className={formErrors.name ? 'border-red-500' : ''}
      />
      {formErrors.name && (
        <div className="text-red-500 text-xs mt-1">{formErrors.name}</div>
      )}
    </div>
    <div className="flex flex-col">
      <RequiredLabel required>Dosage</RequiredLabel>
      <Input
        id="dosage"
        value={""}
        onChange={e => setDosage(e.target.value)}
        required
        className={formErrors.dosage ? 'border-red-500' : ''}
      />
      {formErrors.dosage && (
        <div className="text-red-500 text-xs mt-1">{formErrors.dosage}</div>
      )}
    </div>
    <div className="flex flex-col">
      <RequiredLabel>Frequency</RequiredLabel>
      <Input
        id="frequency"
        value={""}
        onChange={e => setFrequency(e.target.value)}
      />
    </div>
    <div className="flex flex-col">
      <DatePickerField label="Next Due" value={""} onChange={setNextDue} required className="space-y-0" />
      {formErrors.expiration && (
        <div className="text-red-500 text-xs mt-1">{formErrors.expiration}</div>
      )}
    </div>
    <div className="flex flex-col col-span-2">
      <RequiredLabel>Notes</RequiredLabel>
      <Textarea
        id="notes"
        value={""}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
      />
    </div>
  </div>
</form>

    </StandardDialog>
  );
};

export default AddMedicationDialog;
