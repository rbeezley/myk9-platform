import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { FormField } from '@/components/common/FormField';
import type { VetVisitRecord } from './AddVetVisitDialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import DatePickerField from '@/components/common/DatePickerField';

interface EditVetVisitDialogProps {
  open: boolean;
  record: VetVisitRecord | null;
  onClose: () => void;
  onSave: (record: VetVisitRecord) => void;
}

const EditVetVisitDialog: React.FC<EditVetVisitDialogProps> = ({ open, record, onClose, onSave }) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState<string>("");
  const [notes, setNotes] = useState('');
  const [vetName, setVetName] = useState('');
  const [clinicName, setClinicName] = useState('');

  // Sync form state with record prop - using render-time state update pattern
  const recordId = record?.id || '';
  const [lastRecordId, setLastRecordId] = useState(recordId);
  if (recordId !== lastRecordId && record) {
    setLastRecordId(recordId);
    setTitle(record.title);
    setDate(record.date || "");
    setNotes(record.notes);
    setVetName(record.vetName || '');
    setClinicName(record.clinicName || '');
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!record) return;
    onSave({ ...record, title, date, notes, vetName, clinicName });
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() => document.getElementById('edit-vet-visit-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))}
      title="Edit Vet Visit"
      description="All fields are required."
      formId="edit-vet-visit-form"
      saveLabel="Save"
    >
      <form id="edit-vet-visit-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Title" fieldId="editVetVisitTitle" required>
          <Input id="editVetVisitTitle" type="text" value={""} onChange={e => setTitle(e.target.value)} required />
        </FormField>
        <div>
          <DatePickerField
            label="Date"
            value={""}
            onChange={setDate}
            required
          />
        </div>
        <FormField label="Vet Name" fieldId="editVetVisitVetName" required>
          <Input id="editVetVisitVetName" type="text" value={""} onChange={e => setVetName(e.target.value)} required />
        </FormField>
        <FormField label="Clinic Name" fieldId="editVetVisitClinicName" required>
          <Input id="editVetVisitClinicName" type="text" value={""} onChange={e => setClinicName(e.target.value)} required />
        </FormField>
        <FormField label="Notes" fieldId="editVetVisitNotes" required>
          <Textarea id="editVetVisitNotes" value={""} onChange={e => setNotes(e.target.value)} required />
        </FormField>
      </form>
    </StandardDialog>
  );
};

export default EditVetVisitDialog;
