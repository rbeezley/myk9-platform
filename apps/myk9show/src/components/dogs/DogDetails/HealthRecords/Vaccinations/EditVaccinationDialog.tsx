import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { FormField } from '@/components/common/FormField';
import type { VaccinationRecord } from './AddVaccinationDialog';
import { Input } from '@/components/ui/input';
import DatePickerField from '@/components/common/DatePickerField';

interface EditVaccinationDialogProps {
  open: boolean;
  record: VaccinationRecord | null;
  onClose: () => void;
  onSave: (record: VaccinationRecord) => void;
}

const EditVaccinationDialog: React.FC<EditVaccinationDialogProps> = ({ open, record, onClose, onSave }) => {
  const [vaccination, setVaccination] = useState('');
  const [date, setDate] = useState<string>("");
  const [expiration, setExpiration] = useState<string>("");
  const [vetName, setVeterinarian] = useState('');

  // Sync form state with record prop - using render-time state update pattern
  const recordId = record?.id || '';
  const [lastRecordId, setLastRecordId] = useState(recordId);
  if (recordId !== lastRecordId && record) {
    setLastRecordId(recordId);
    setVaccination(record.vaccination);
    setDate(record.date || "");
    setExpiration(record.expiration || "");
    setVeterinarian(record.vetName);
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!record) return;


onSave({
      ...record,
      vaccination,
      date,
      expiration,
      vetName
    });
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() => document.getElementById('edit-vaccination-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))}
      title="Edit Vaccination Record"
      description="All fields are required."
      formId="edit-vaccination-form"
      saveLabel="Save"
    >
      <form id="edit-vaccination-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Vaccination" fieldId="editVaccination" required>
          <Input id="editVaccination" type="text" value={""} onChange={e => setVaccination(e.target.value)} required />
        </FormField>
        <div>
          <DatePickerField
            label="Date"
            value={""}
            onChange={setDate}
            required
          />
        </div>
        <div>
          <DatePickerField
            label="Expiration"
            value={""}
            onChange={setExpiration}
            required
          />
        </div>
        <FormField label="Veterinarian" fieldId="editVaccinationVet" required>
          <Input id="editVaccinationVet" type="text" value={""} onChange={e => setVeterinarian(e.target.value)} required />
        </FormField>
      </form>
    </StandardDialog>
  );
};

export default EditVaccinationDialog;
