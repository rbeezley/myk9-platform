import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { FormField } from '@/components/common/FormField';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import DatePickerField from '@/components/common/DatePickerField';
import type { VetVisitRecord } from '@/types/health';
import { FieldError, fieldErrorControlProps, useSubmitFieldErrors } from '@/components/forms';

interface EditVetVisitDialogProps {
  open: boolean;
  record: VetVisitRecord | null;
  onClose: () => void;
  onSave: (record: VetVisitRecord) => void;
  /** True while the update mutation is in flight; disables the Save button. */
  isSaving?: boolean;
  /** Set when the update mutation was rejected; rendered as a retryable error. */
  saveError?: string | null;
}

const EditVetVisitDialog: React.FC<EditVetVisitDialogProps> = ({
  open,
  record,
  onClose,
  onSave,
  isSaving = false,
  saveError = null,
}) => {
  const [reason, setReason] = useState(record?.reason || '');
  const [visitDate, setVisitDate] = useState(record?.visit_date || '');
  const [notes, setNotes] = useState(record?.notes || '');
  const [vetName, setVetName] = useState(record?.vet_name || '');
  const [clinicName, setClinicName] = useState(record?.clinic_name || '');
  const [diagnosis, setDiagnosis] = useState(record?.diagnosis || '');
  const [treatment, setTreatment] = useState(record?.treatment || '');
  const errors: Record<string, string> = {};
  if (!reason.trim()) errors.editVetVisitReason = 'Enter the reason for the visit.';
  if (!visitDate) errors.editVetVisitDate = 'Choose the visit date.';
  if (!vetName.trim()) errors.editVetVisitVetName = "Enter the vet's name.";
  const { shown, fail } = useSubmitFieldErrors(errors);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!record) return;
    // The per-field error map guards the mutation: an invalid submission never reaches it.
    // `required` stays on the inputs for semantics; the form is noValidate so the callouts show.
    if (fail()) return;
    onSave({
      ...record,
      visit_date: visitDate,
      reason,
      diagnosis: diagnosis || undefined,
      treatment: treatment || undefined,
      vet_name: vetName || undefined,
      clinic_name: clinicName || undefined,
      notes: notes || undefined,
    });
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() => {
        const form = document.getElementById('edit-vet-visit-form');
        if (form instanceof HTMLFormElement) form.requestSubmit();
      }}
      title="Edit Vet Visit"
      description="All fields are required."
      formId="edit-vet-visit-form"
      saveLabel="Save"
      isSubmitting={isSaving}
    >
      {saveError && (
        <p role="alert" aria-live="assertive" className="text-sm text-destructive mb-3">
          {`${saveError} The record was not saved. Please try again.`}
        </p>
      )}
      <form
        id="edit-vet-visit-form"
        noValidate
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        <FormField label="Reason" fieldId="editVetVisitReason" required>
          <Input
            id="editVetVisitReason"
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            required
            {...fieldErrorControlProps('editVetVisitReason', shown.editVetVisitReason)}
          />
          <FieldError field="editVetVisitReason" message={shown.editVetVisitReason} />
        </FormField>
        <div>
          <DatePickerField
            label="Date"
            value={visitDate}
            onChange={setVisitDate}
            required
            triggerId="editVetVisitDate"
            {...fieldErrorControlProps('editVetVisitDate', shown.editVetVisitDate)}
          />
          <FieldError field="editVetVisitDate" message={shown.editVetVisitDate} />
        </div>
        <FormField label="Vet Name" fieldId="editVetVisitVetName" required>
          <Input
            id="editVetVisitVetName"
            type="text"
            value={vetName}
            onChange={e => setVetName(e.target.value)}
            required
            {...fieldErrorControlProps('editVetVisitVetName', shown.editVetVisitVetName)}
          />
          <FieldError field="editVetVisitVetName" message={shown.editVetVisitVetName} />
        </FormField>
        <FormField label="Clinic Name" fieldId="editVetVisitClinicName">
          <Input
            id="editVetVisitClinicName"
            type="text"
            value={clinicName}
            onChange={e => setClinicName(e.target.value)}
          />
        </FormField>
        <FormField label="Diagnosis" fieldId="editVetVisitDiagnosis">
          <Textarea
            id="editVetVisitDiagnosis"
            value={diagnosis}
            onChange={e => setDiagnosis(e.target.value)}
          />
        </FormField>
        <FormField label="Treatment" fieldId="editVetVisitTreatment">
          <Textarea
            id="editVetVisitTreatment"
            value={treatment}
            onChange={e => setTreatment(e.target.value)}
          />
        </FormField>
        <FormField label="Notes" fieldId="editVetVisitNotes">
          <Textarea id="editVetVisitNotes" value={notes} onChange={e => setNotes(e.target.value)} />
        </FormField>
      </form>
    </StandardDialog>
  );
};

export default EditVetVisitDialog;
