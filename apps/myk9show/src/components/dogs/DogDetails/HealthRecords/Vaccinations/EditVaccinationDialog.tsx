import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { FormField } from '@/components/common/FormField';
import { Input } from '@/components/ui/input';
import DatePickerField from '@/components/common/DatePickerField';
import type { VaccinationRecord } from '@/types/health';

interface EditVaccinationDialogProps {
  open: boolean;
  record: VaccinationRecord | null;
  onClose: () => void;
  onSave: (record: VaccinationRecord) => void;
}

const EditVaccinationDialog: React.FC<EditVaccinationDialogProps> = ({
  open,
  record,
  onClose,
  onSave,
}) => {
  const [vaccineName, setVaccineName] = useState(record?.vaccine_name || '');
  const [dateGiven, setDateGiven] = useState(record?.date_given || '');
  const [expirationDate, setExpirationDate] = useState(record?.expiration_date || '');
  const [vetName, setVeterinarian] = useState(record?.vet_name || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!record) return;
    onSave({
      ...record,
      vaccine_name: vaccineName,
      date_given: dateGiven,
      expiration_date: expirationDate || undefined,
      vet_name: vetName || undefined,
    });
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() =>
        document
          .getElementById('edit-vaccination-form')
          ?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
      }
      title="Edit Vaccination Record"
      description="All fields are required."
      formId="edit-vaccination-form"
      saveLabel="Save"
    >
      <form id="edit-vaccination-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Vaccination" fieldId="editVaccination" required>
          <Input
            id="editVaccination"
            type="text"
            value={vaccineName}
            onChange={e => setVaccineName(e.target.value)}
            required
          />
        </FormField>
        <div>
          <DatePickerField label="Date" value={dateGiven} onChange={setDateGiven} required />
        </div>
        <div>
          <DatePickerField
            label="Expiration"
            value={expirationDate}
            onChange={setExpirationDate}
            required
          />
        </div>
        <FormField label="Veterinarian" fieldId="editVaccinationVet" required>
          <Input
            id="editVaccinationVet"
            type="text"
            value={vetName}
            onChange={e => setVeterinarian(e.target.value)}
            required
          />
        </FormField>
      </form>
    </StandardDialog>
  );
};

export default EditVaccinationDialog;
