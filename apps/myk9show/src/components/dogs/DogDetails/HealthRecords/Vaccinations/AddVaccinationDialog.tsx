import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { FormField } from '@/components/common/FormField';
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
    if (!vaccination) errors.vaccination = 'Please enter a vaccination name.';
    if (!date) errors.date = 'Please select a date.';
    if (!expiration) errors.expiration = 'Please select an expiration date.';
    if (!vetName) errors.vetName = 'Please enter a veterinarian name.';
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
        <FormField label="Vaccination" fieldId="addVaccination" required error={formErrors.vaccination}>
          <Input
            id="addVaccination"
            type="text"
            value={""}
            onChange={e => setVaccination(e.target.value)}
            required
            aria-invalid={!!formErrors.vaccination}
            aria-describedby={formErrors.vaccination ? 'addVaccination-error' : undefined}
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
        <div>
          <DatePickerField
            label="Expiration Date"
            value={""}
            onChange={setExpiration}
            required
          />
          {formErrors.expiration && <p className="text-sm text-destructive" role="alert">{formErrors.expiration}</p>}
        </div>
        <FormField label="Veterinarian" fieldId="addVaccinationVet" required error={formErrors.vetName}>
          <Input
            id="addVaccinationVet"
            type="text"
            value={""}
            onChange={e => setVeterinarian(e.target.value)}
            required
            aria-invalid={!!formErrors.vetName}
            aria-describedby={formErrors.vetName ? 'addVaccinationVet-error' : undefined}
          />
        </FormField>
      </form>
    </StandardDialog>
  );
};

export default AddVaccinationDialog;
