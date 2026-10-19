import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { FormField } from '@/components/common/FormField';
import { Input } from '@/components/ui/input';
import DatePickerField from '@/components/common/DatePickerField';
import type { VaccinationRecord } from '@/types/health';
import { FieldError, fieldErrorControlProps, useSubmitFieldErrors } from '@/components/forms';

interface EditVaccinationDialogProps {
  open: boolean;
  record: VaccinationRecord | null;
  onClose: () => void;
  onSave: (record: VaccinationRecord) => void;
  /** True while the update mutation is in flight; disables the Save button. */
  isSaving?: boolean;
  /** Set when the update mutation was rejected; rendered as a retryable error. */
  saveError?: string | null;
}

const EditVaccinationDialog: React.FC<EditVaccinationDialogProps> = ({
  open,
  record,
  onClose,
  onSave,
  isSaving = false,
  saveError = null,
}) => {
  const [vaccineName, setVaccineName] = useState(record?.vaccine_name || '');
  const [dateGiven, setDateGiven] = useState(record?.date_given || '');
  const [expirationDate, setExpirationDate] = useState(record?.expiration_date || '');
  const [vetName, setVeterinarian] = useState(record?.vet_name || '');
  const errors: Record<string, string> = {};
  if (!vaccineName.trim()) errors.editVaccination = 'Enter the vaccine name.';
  if (!dateGiven) errors.editVaccinationDate = 'Choose the date given.';
  if (!expirationDate) errors.editVaccinationExpiration = 'Choose the expiration date.';
  if (!vetName.trim()) errors.editVaccinationVet = "Enter the veterinarian's name.";
  const { shown, fail } = useSubmitFieldErrors(errors);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!record) return;
    // The per-field error map guards the mutation: an invalid submission never reaches it.
    // `required` stays on the inputs for semantics; the form is noValidate so the callouts show.
    if (fail()) return;
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
      onSave={() => {
        const form = document.getElementById('edit-vaccination-form');
        if (form instanceof HTMLFormElement) form.requestSubmit();
      }}
      title="Edit Vaccination Record"
      description="All fields are required."
      formId="edit-vaccination-form"
      saveLabel="Save"
      isSubmitting={isSaving}
    >
      {saveError && (
        <p role="alert" aria-live="assertive" className="text-sm text-destructive mb-3">
          {`${saveError} The record was not saved. Please try again.`}
        </p>
      )}
      <form
        id="edit-vaccination-form"
        noValidate
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        <FormField label="Vaccination" fieldId="editVaccination" required>
          <Input
            id="editVaccination"
            type="text"
            value={vaccineName}
            onChange={e => setVaccineName(e.target.value)}
            required
            {...fieldErrorControlProps('editVaccination', shown.editVaccination)}
          />
          <FieldError field="editVaccination" message={shown.editVaccination} />
        </FormField>
        <div>
          <DatePickerField
            label="Date"
            value={dateGiven}
            onChange={setDateGiven}
            required
            triggerId="editVaccinationDate"
            {...fieldErrorControlProps('editVaccinationDate', shown.editVaccinationDate)}
          />
          <FieldError field="editVaccinationDate" message={shown.editVaccinationDate} />
        </div>
        <div>
          <DatePickerField
            label="Expiration"
            value={expirationDate}
            onChange={setExpirationDate}
            required
            triggerId="editVaccinationExpiration"
            {...fieldErrorControlProps(
              'editVaccinationExpiration',
              shown.editVaccinationExpiration
            )}
          />
          <FieldError field="editVaccinationExpiration" message={shown.editVaccinationExpiration} />
        </div>
        <FormField label="Veterinarian" fieldId="editVaccinationVet" required>
          <Input
            id="editVaccinationVet"
            type="text"
            value={vetName}
            onChange={e => setVeterinarian(e.target.value)}
            required
            {...fieldErrorControlProps('editVaccinationVet', shown.editVaccinationVet)}
          />
          <FieldError field="editVaccinationVet" message={shown.editVaccinationVet} />
        </FormField>
      </form>
    </StandardDialog>
  );
};

export default EditVaccinationDialog;
