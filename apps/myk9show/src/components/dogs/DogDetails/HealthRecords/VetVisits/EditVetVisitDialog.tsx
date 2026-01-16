import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
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
        <div>
          <label className="block mb-1 font-medium">Title <span className="text-red-500">*</span></label>
          <Input type="text" value={""} onChange={e => setTitle(e.target.value)} required />
        </div>
        <div>
          <DatePickerField
            label="Date"
            value={""}
            onChange={setDate}
            required
          />
        </div>
        <div>
          <label className="block mb-1 font-medium">Vet Name <span className="text-red-500">*</span></label>
          <Input type="text" value={""} onChange={e => setVetName(e.target.value)} required />
        </div>
        <div>
          <label className="block mb-1 font-medium">Clinic Name <span className="text-red-500">*</span></label>
          <Input type="text" value={""} onChange={e => setClinicName(e.target.value)} required />
        </div>
        <div>
          <label className="block mb-1 font-medium">Notes <span className="text-red-500">*</span></label>
          <Textarea value={""} onChange={e => setNotes(e.target.value)} required />
        </div>
      </form>
    </StandardDialog>
  );
};

export default EditVetVisitDialog;
