import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import RequiredLabel from '@/components/common/RequiredLabel';
import { Input } from '@/components/ui/input';
import DatePickerField from '@/components/common/DatePickerField';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';

export interface VetVisitRecord {
  id?: number;
  title: string;
  date: string;
  notes: string;
  vetName: string;
  clinicName: string;
}

interface AddVetVisitDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (record: VetVisitRecord) => void;
}

const AddVetVisitDialog: React.FC<AddVetVisitDialogProps> = ({ open, onClose, onAdd }) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState<string>("");
  const [notes, setNotes] = useState('');
  const [vetName, setVetName] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { [key: string]: string } = {};
    if (!title) errors.title = 'Title is required.';
    if (!date) errors.date = 'Date is required.';
    if (!vetName) errors.vetName = 'Vet Name is required.';
    if (!clinicName) errors.clinicName = 'Clinic Name is required.';
    if (!notes) errors.notes = 'Notes are required.';
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    onAdd({ title, date, notes, vetName, clinicName });
    setTitle('');
    setDate("");
    setNotes('');
    setVetName('');
    setClinicName('');
    setFormErrors({});
    onClose();
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() => document.getElementById('add-vet-visit-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))}
      title="Add Vet Visit"
      description="All fields are required."
      formId="add-vet-visit-form"
      saveLabel={<><Plus className="mr-2 h-4 w-4" /> Add</>}
    >
      <form id="add-vet-visit-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <RequiredLabel required>Title</RequiredLabel>
          <Input type="text" value={""} onChange={e => setTitle(e.target.value)} required className={formErrors.title ? 'border-destructive' : ''} />
          {formErrors.title && <div className="text-red-500 text-xs mt-1">{formErrors.title}</div>}
        </div>
        <div>
          <DatePickerField
            label="Date"
            value={""}
            onChange={setDate}
            required
          />
          {formErrors.date && <div className="text-red-500 text-xs mt-1">{formErrors.date}</div>}
        </div>
        <div>
          <RequiredLabel required>Vet Name</RequiredLabel>
          <Input type="text" value={""} onChange={e => setVetName(e.target.value)} required className={formErrors.vetName ? 'border-destructive' : ''} />
          {formErrors.vetName && <div className="text-red-500 text-xs mt-1">{formErrors.vetName}</div>}
        </div>
        <div>
          <RequiredLabel required>Clinic Name</RequiredLabel>
          <Input type="text" value={""} onChange={e => setClinicName(e.target.value)} required className={formErrors.clinicName ? 'border-destructive' : ''} />
          {formErrors.clinicName && <div className="text-red-500 text-xs mt-1">{formErrors.clinicName}</div>}
        </div>
        <div>
          <RequiredLabel required>Notes</RequiredLabel>
          <Textarea value={""} onChange={e => setNotes(e.target.value)} required className={formErrors.notes ? 'border-destructive' : ''} />
          {formErrors.notes && <div className="text-red-500 text-xs mt-1">{formErrors.notes}</div>}
        </div>
      </form>
    </StandardDialog>
  );
};

export default AddVetVisitDialog;
