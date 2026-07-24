import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { FormField } from '@/components/common/FormField';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import DatePickerField from '@/components/common/DatePickerField';
import type { MedicationRecord } from '@/types/health';

interface EditMedicationDialogProps {
  open: boolean;
  record: MedicationRecord | null;
  onClose: () => void;
  onSave: (record: MedicationRecord) => void;
  /** True while the update mutation is in flight; disables the Save button. */
  isSaving?: boolean;
  /** Set when the update mutation was rejected; rendered as a retryable error. */
  saveError?: string | null;
}

const EditMedicationDialog: React.FC<EditMedicationDialogProps> = ({
  open,
  record,
  onClose,
  onSave,
  isSaving = false,
  saveError = null,
}) => {
  const [medicationName, setMedicationName] = useState(record?.medication_name || '');
  const [dosage, setDosage] = useState(record?.dosage || '');
  const [frequency, setFrequency] = useState(record?.frequency || '');
  const [notes, setNotes] = useState(record?.notes || '');
  const [startDate, setStartDate] = useState(record?.start_date || '');
  const [endDate, setEndDate] = useState(record?.end_date || '');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!record) return;
    // Validate at the form boundary in addition to native `required`
    // attributes so an invalid submission never reaches the mutation.
    if (!medicationName.trim() || !dosage.trim()) {
      setValidationError('Name and Dosage are required.');
      return;
    }
    setValidationError(null);
    onSave({
      ...record,
      medication_name: medicationName,
      dosage: dosage || undefined,
      frequency: frequency || undefined,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      notes: notes || undefined,
    });
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() => {
        const form = document.getElementById('edit-medication-form');
        if (form instanceof HTMLFormElement) form.requestSubmit();
      }}
      title="Edit Medication"
      description="All fields are required."
      formId="edit-medication-form"
      saveLabel="Save"
      isSubmitting={isSaving}
    >
      {(validationError || saveError) && (
        <p role="alert" aria-live="assertive" className="text-sm text-destructive mb-3">
          {validationError ?? `${saveError} The record was not saved. Please try again.`}
        </p>
      )}
      {/*
  Two-column grid layout for medication fields:
  - Name, Dosage, Frequency, Next Due each get their own cell
  - Notes spans both columns for full width
  - Consistent gap between fields, responsive width
*/}
      <form
        id="edit-medication-form"
        onSubmit={handleSubmit}
        className="py-4 min-w-[350px] max-w-[500px] mx-auto"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Name" fieldId="editMedicationName" required>
            <Input
              id="editMedicationName"
              value={medicationName}
              onChange={e => setMedicationName(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Dosage" fieldId="editDosage" required>
            <Input
              id="editDosage"
              value={dosage}
              onChange={e => setDosage(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Frequency" fieldId="editFrequency">
            <Input
              id="editFrequency"
              value={frequency}
              onChange={e => setFrequency(e.target.value)}
            />
          </FormField>
          <DatePickerField
            label="Start Date"
            value={startDate}
            onChange={setStartDate}
            className="space-y-0"
          />
          <DatePickerField
            label="End Date"
            value={endDate}
            onChange={setEndDate}
            className="space-y-0"
          />
          <FormField label="Notes" fieldId="editNotes" className="col-span-2">
            <Textarea id="editNotes" value={notes} onChange={e => setNotes(e.target.value)} />
          </FormField>
        </div>
      </form>
    </StandardDialog>
  );
};

export default EditMedicationDialog;
