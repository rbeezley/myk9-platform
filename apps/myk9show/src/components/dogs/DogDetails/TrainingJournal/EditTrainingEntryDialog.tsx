import React, { useState } from 'react';
import { DatePicker } from '@/components/ui/date-picker';
import StandardDialog from '@/components/common/StandardDialog';
import { FormField } from '@/components/common/FormField';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { TrainingEntry } from './AddTrainingEntryDialog';
import { parseLocalDateString, formatDateLocal } from '@/utils/dateLocal';

interface EditTrainingEntryDialogProps {
  open: boolean;
  entry: TrainingEntry | null;
  onClose: () => void;
  onSave: (entry: TrainingEntry) => void;
}

const EditTrainingEntryDialog: React.FC<EditTrainingEntryDialogProps> = ({ open, entry, onClose, onSave }) => {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState('');
  const [tags, setTags] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Sync form state with entry prop - using render-time state update pattern
  const entryId = entry?.id || '';
  const [lastEntryId, setLastEntryId] = useState(entryId);
  if (entryId !== lastEntryId && entry) {
    setLastEntryId(entryId);
    setTitle(entry.title);
    setNotes(entry.notes);
    setDate(entry.date);
    setTags(entry.tags ? entry.tags.join(', ') : '');
    setErrors({});
  }

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!title) newErrors.title = 'Please enter a title';
    if (!notes) newErrors.notes = 'Please enter notes';
    if (!date) newErrors.date = 'Please select a date';
    return newErrors;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!entry) return;
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;
    onSave({ ...entry, title, notes, date, tags: tags.split(',').map(t => t.trim()).filter(Boolean) });
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() => document.getElementById('edit-training-entry-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))}
      title="Edit Training Entry"
      formId="edit-training-entry-form"
      saveLabel="Save"
    >
      <form id="edit-training-entry-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Title" fieldId="trainingTitle" required error={errors.title}>
          <Input
            id="trainingTitle"
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? 'trainingTitle-error' : undefined}
          />
        </FormField>
        <FormField label="Notes" fieldId="trainingNotes" required error={errors.notes}>
          <Textarea
            id="trainingNotes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            aria-invalid={!!errors.notes}
            aria-describedby={errors.notes ? 'trainingNotes-error' : undefined}
          />
        </FormField>
        <FormField label="Date" fieldId="trainingEntryDate" required error={errors.date}>
          <DatePicker
            date={date ? parseLocalDateString(date) : undefined}
            setDate={(newDate) => setDate(newDate ? formatDateLocal(newDate) : '')}
            required
            className="dialog-input-bg w-full"
            id="trainingEntryDate"
            name="date"
            placeholder="YYYY-MM-DD"
          />
        </FormField>
        <FormField label="Tags (comma separated)" fieldId="trainingTags">
          <Input
            id="trainingTags"
            type="text"
            value={tags}
            onChange={e => setTags(e.target.value)}
            placeholder="e.g. Obedience, Progress"
          />
        </FormField>
      </form>
    </StandardDialog>
  );
};

export default EditTrainingEntryDialog;
