import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { FormField } from '@/components/common/FormField';
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
    if (!title) errors.title = 'Please enter a title.';
    if (!date) errors.date = 'Please select a date.';
    if (!vetName) errors.vetName = 'Please enter a vet name.';
    if (!clinicName) errors.clinicName = 'Please enter a clinic name.';
    if (!notes) errors.notes = 'Please enter notes.';
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
        <FormField label="Title" fieldId="addVetVisitTitle" required error={formErrors.title}>
          <Input
            id="addVetVisitTitle"
            type="text"
            value={""}
            onChange={e => setTitle(e.target.value)}
            required
            aria-invalid={!!formErrors.title}
            aria-describedby={formErrors.title ? 'addVetVisitTitle-error' : undefined}
          />
        </FormField>
        <div>
          <DatePickerField
            label="Date"
            value={""}
            onChange={setDate}
            required
          />
          {formErrors.date && <p className="text-sm text-destructive" role="alert">{formErrors.date}</p>}
        </div>
        <FormField label="Vet Name" fieldId="addVetVisitVetName" required error={formErrors.vetName}>
          <Input
            id="addVetVisitVetName"
            type="text"
            value={""}
            onChange={e => setVetName(e.target.value)}
            required
            aria-invalid={!!formErrors.vetName}
            aria-describedby={formErrors.vetName ? 'addVetVisitVetName-error' : undefined}
          />
        </FormField>
        <FormField label="Clinic Name" fieldId="addVetVisitClinicName" required error={formErrors.clinicName}>
          <Input
            id="addVetVisitClinicName"
            type="text"
            value={""}
            onChange={e => setClinicName(e.target.value)}
            required
            aria-invalid={!!formErrors.clinicName}
            aria-describedby={formErrors.clinicName ? 'addVetVisitClinicName-error' : undefined}
          />
        </FormField>
        <FormField label="Notes" fieldId="addVetVisitNotes" required error={formErrors.notes}>
          <Textarea
            id="addVetVisitNotes"
            value={""}
            onChange={e => setNotes(e.target.value)}
            required
            aria-invalid={!!formErrors.notes}
            aria-describedby={formErrors.notes ? 'addVetVisitNotes-error' : undefined}
          />
        </FormField>
      </form>
    </StandardDialog>
  );
};

export default AddVetVisitDialog;
