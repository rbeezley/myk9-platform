import React, { useState, useEffect } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import type { MedicationRecord } from './AddMedicationDialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import RequiredLabel from '@/components/common/RequiredLabel';
import DatePickerField from '@/components/common/DatePickerField';

interface EditMedicationDialogProps {
  open: boolean;
  record: MedicationRecord | null;
  onClose: () => void;
  onSave: (record: MedicationRecord) => void;
}

const EditMedicationDialog: React.FC<EditMedicationDialogProps> = ({ open, record, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');
  const [notes, setNotes] = useState('');
  const [expiration, setNextDue] = useState<string>("");

  useEffect(() => {
    if (record) {
      setName(record.name);
      setDosage(record.dosage);
      setFrequency(record.frequency);
      setNotes(record.notes);
      setNextDue(record.expiration || "");
    }
  }, [record]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!record) return;
    onSave({
      ...record,
      name,
      dosage,
      frequency,
      notes,
      expiration
    });
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() => document.getElementById('edit-medication-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))}
      title="Edit Medication"
      description="All fields are required."
      formId="edit-medication-form"
      saveLabel="Save"
    >
      {/*
  Two-column grid layout for medication fields:
  - Name, Dosage, Frequency, Next Due each get their own cell
  - Notes spans both columns for full width
  - Consistent gap between fields, responsive width
*/}
<form
  id="edit-medication-form"
  onSubmit={handleSubmit}
  className="py-4 min-w-[350px] max-w-[500px] mx-auto"
>
  <div className="grid grid-cols-2 gap-4">
    <div className="flex flex-col">
      <RequiredLabel required>Name</RequiredLabel>
      <Input
        id="editMedicationName"
        value={""}
        onChange={e => setName(e.target.value)}
        required
      />
    </div>
    <div className="flex flex-col">
      <RequiredLabel required>Dosage</RequiredLabel>
      <Input
        id="editDosage"
        value={""}
        onChange={e => setDosage(e.target.value)}
        required
      />
    </div>
    <div className="flex flex-col">
      <RequiredLabel>Frequency</RequiredLabel>
      <Input
        id="editFrequency"
        value={""}
        onChange={e => setFrequency(e.target.value)}
      />
    </div>
    <div className="flex flex-col">
      <DatePickerField label="Next Due" value={""} onChange={setNextDue} required className="space-y-0" />
    </div>
    <div className="flex flex-col col-span-2">
      <RequiredLabel>Notes</RequiredLabel>
      <Textarea
        id="editNotes"
        value={""}
        onChange={e => setNotes(e.target.value)}
      />
    </div>
  </div>
</form>

    </StandardDialog>
  );
};

export default EditMedicationDialog;
