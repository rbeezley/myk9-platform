import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import RequiredLabel from '@/components/common/RequiredLabel';
import { Input } from '@/components/ui/input';
import DatePickerField from '@/components/common/DatePickerField';
import { Plus } from 'lucide-react';

export interface VaccinationRecord {
  id?: number;
  vaccination: string;
  date: string;
  expiration: string;
  vetName: string;
}

interface AddVaccinationDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (record: VaccinationRecord) => void;
}

const AddVaccinationDialog: React.FC<AddVaccinationDialogProps> = ({ open, onClose, onAdd }) => {
  const [vaccination, setVaccination] = useState('');
  const [date, setDate] = useState<string>("");
  const [expiration, setExpiration] = useState<string>("");
  const [vetName, setVeterinarian] = useState('');
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { [key: string]: string } = {};
    if (!vaccination) errors.vaccination = 'Vaccination is required.';
    if (!date) errors.date = 'Date is required.';
    if (!expiration) errors.expiration = 'Expiration is required.';
    if (!vetName) errors.vetName = 'Veterinarian is required.';
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    onAdd({ vaccination, date, expiration, vetName });
    setVaccination('');
    setDate("");
    setExpiration("");
    setVeterinarian('');
    setFormErrors({});
    onClose();
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() => document.getElementById('add-vaccination-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))}
      title="Add Vaccination Record"
      description="All fields are required."
      formId="add-vaccination-form"
      saveLabel={<><Plus className="mr-2 h-4 w-4" /> Add</>}
    >
      <form id="add-vaccination-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <RequiredLabel required>Vaccination</RequiredLabel>
          <Input type="text" value={""} onChange={e => setVaccination(e.target.value)} required className={formErrors.vaccination ? 'border-red-500' : ''} />
          {formErrors.vaccination && <div className="text-red-500 text-xs mt-1">{formErrors.vaccination}</div>}
        </div>
        <div>
          <RequiredLabel required>Date</RequiredLabel>
          <DatePickerField
            label="Date"
            value={""}
            onChange={setDate}
            required
          />
          {formErrors.date && <div className="text-red-500 text-xs mt-1">{formErrors.date}</div>}
        </div>
        <div>
          <RequiredLabel required>Expiration</RequiredLabel>
          <DatePickerField
            label="Expiration Date"
            value={""}
            onChange={setExpiration}
            required
          />
          {formErrors.expiration && <div className="text-red-500 text-xs mt-1">{formErrors.expiration}</div>}
        </div>
        <div>
          <RequiredLabel required>Veterinarian</RequiredLabel>
          <Input type="text" value={""} onChange={e => setVeterinarian(e.target.value)} required className={formErrors.vetName ? 'border-red-500' : ''} />
          {formErrors.vetName && <div className="text-red-500 text-xs mt-1">{formErrors.vetName}</div>}
        </div>
      </form>
    </StandardDialog>
  );
};

export default AddVaccinationDialog;
