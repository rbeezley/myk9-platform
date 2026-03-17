import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { FormField } from '@/components/common/FormField';
import type { MedicationRecord } from './AddMedicationDialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

  // Sync form state with record prop - using render-time state update pattern
  const recordId = record?.id || '';
  const [lastRecordId, setLastRecordId] = useState(recordId);
  if (recordId !== lastRecordId && record) {
    setLastRecordId(recordId);
    setName(record.name);
    setDosage(record.dosage);
    setFrequency(record.frequency);
    setNotes(record.notes);
    setNextDue(record.expiration || "");
  }

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
    <FormField label="Name" fieldId="editMedicationName" required>
      <Input
        id="editMedicationName"
        value={""}
        onChange={e => setName(e.target.value)}
        required
      />
    </FormField>
    <FormField label="Dosage" fieldId="editDosage" required>
      <Input
        id="editDosage"
        value={""}
        onChange={e => setDosage(e.target.value)}
        required
      />
    </FormField>
    <FormField label="Frequency" fieldId="editFrequency">
      <Input
        id="editFrequency"
        value={""}
        onChange={e => setFrequency(e.target.value)}
      />
    </FormField>
    <div className="flex flex-col">
      <DatePickerField label="Next Due" value={""} onChange={setNextDue} required className="space-y-0" />
    </div>
    <FormField label="Notes" fieldId="editNotes" className="col-span-2">
      <Textarea
        id="editNotes"
        value={""}
        onChange={e => setNotes(e.target.value)}
      />
    </FormField>
  </div>
</form>

    </StandardDialog>
  );
};

export default EditMedicationDialog;
