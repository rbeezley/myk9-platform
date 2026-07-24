import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { FormField } from '@/components/common/FormField';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { AllergyRecord } from '@/types/health';

interface EditAllergyDialogProps {
  open: boolean;
  record: AllergyRecord | null;
  onClose: () => void;
  onSave: (record: AllergyRecord) => void;
  /** True while the update mutation is in flight; disables the Save button. */
  isSaving?: boolean;
  /** Set when the update mutation was rejected; rendered as a retryable error. */
  saveError?: string | null;
}

type AllergySeverityInput = NonNullable<AllergyRecord['severity']> | '';

const EditAllergyDialog: React.FC<EditAllergyDialogProps> = ({
  open,
  record,
  onClose,
  onSave,
  isSaving = false,
  saveError = null,
}) => {
  const [allergen, setAllergen] = useState(record?.allergen || '');
  const [reaction, setReaction] = useState(record?.reaction || '');
  const [severity, setSeverity] = useState<AllergySeverityInput>(record?.severity || '');
  const [discoveredDate, setDiscoveredDate] = useState(record?.discovered_date || '');
  const [notes, setNotes] = useState(record?.notes || '');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!record) return;
    // Validate at the form boundary in addition to native `required`
    // attributes so an invalid submission never reaches the mutation.
    if (!allergen.trim()) {
      setValidationError('Allergy Name is required.');
      return;
    }
    setValidationError(null);
    onSave({
      ...record,
      allergen,
      reaction: reaction || undefined,
      severity: severity || undefined,
      discovered_date: discoveredDate || undefined,
      notes: notes || undefined,
    });
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() => {
        const form = document.getElementById('edit-allergy-form');
        if (form instanceof HTMLFormElement) form.requestSubmit();
      }}
      title="Edit Allergy"
      description="All fields are required."
      formId="edit-allergy-form"
      saveLabel="Save"
      isSubmitting={isSaving}
    >
      {(validationError || saveError) && (
        <p role="alert" aria-live="assertive" className="text-sm text-destructive mb-3">
          {validationError ?? `${saveError} The record was not saved. Please try again.`}
        </p>
      )}
      <form id="edit-allergy-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Allergy Name" fieldId="editAllergyName" required>
          <Input
            id="editAllergyName"
            type="text"
            value={allergen}
            onChange={e => setAllergen(e.target.value)}
            required
          />
        </FormField>
        <FormField label="Reaction" fieldId="editAllergyReaction">
          <Input
            id="editAllergyReaction"
            type="text"
            value={reaction}
            onChange={e => setReaction(e.target.value)}
          />
        </FormField>
        <FormField label="Severity" fieldId="editAllergySeverity">
          <select
            id="editAllergySeverity"
            value={severity || ''}
            onChange={e => setSeverity(e.target.value as AllergySeverityInput)}
            className="w-full px-3 py-2 border rounded-md"
          >
            <option value="">Select severity</option>
            <option value="mild">Mild</option>
            <option value="moderate">Moderate</option>
            <option value="severe">Severe</option>
            <option value="life_threatening">Life Threatening</option>
          </select>
        </FormField>
        <FormField label="Discovered Date" fieldId="editAllergyDiscoveredDate">
          <Input
            id="editAllergyDiscoveredDate"
            type="date"
            value={discoveredDate}
            onChange={e => setDiscoveredDate(e.target.value)}
          />
        </FormField>
        <FormField label="Notes" fieldId="editAllergyNotes">
          <Textarea id="editAllergyNotes" value={notes} onChange={e => setNotes(e.target.value)} />
        </FormField>
      </form>
    </StandardDialog>
  );
};

export default EditAllergyDialog;
