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
}

type AllergySeverityInput = NonNullable<AllergyRecord['severity']> | '';

const EditAllergyDialog: React.FC<EditAllergyDialogProps> = ({ open, record, onClose, onSave }) => {
  const [allergen, setAllergen] = useState(record?.allergen || '');
  const [reaction, setReaction] = useState(record?.reaction || '');
  const [severity, setSeverity] = useState<AllergySeverityInput>(record?.severity || '');
  const [discoveredDate, setDiscoveredDate] = useState(record?.discovered_date || '');
  const [notes, setNotes] = useState(record?.notes || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!record) return;
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
      onSave={() =>
        document
          .getElementById('edit-allergy-form')
          ?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
      }
      title="Edit Allergy"
      description="All fields are required."
      formId="edit-allergy-form"
      saveLabel="Save"
    >
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
