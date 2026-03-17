import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { FormField } from '@/components/common/FormField';
import { Input } from '@/components/ui/input';
import DatePickerField from '@/components/common/DatePickerField';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';

export interface TrainingEntry {
  id: number;
  title: string;
  notes: string;
  date: string;
  tags: string[];
}

interface AddTrainingEntryDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (entry: TrainingEntry) => void;
}

const AddTrainingEntryDialog: React.FC<AddTrainingEntryDialogProps> = ({
  open,
  onClose,
  onAdd,
}) => {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState<string>('');
  const [tags, setTags] = useState('');

  // Form validation state
  const [errors, setErrors] = useState<{
    title?: string | undefined;
    notes?: string | undefined;
    date?: string | undefined;
  }>({});

  // Clear validation errors when input changes using controlled update pattern
  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (errors.title) {
      setErrors(prev => ({ ...prev, title: undefined }));
    }
  };

  const handleNotesChange = (value: string) => {
    setNotes(value);
    if (errors.notes) {
      setErrors(prev => ({ ...prev, notes: undefined }));
    }
  };

  const handleDateChange = (value: string) => {
    setDate(value);
    if (errors.date) {
      setErrors(prev => ({ ...prev, date: undefined }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    const newErrors: { [key: string]: string } = {};
    if (!title) newErrors.title = 'Please enter a title.';
    if (!notes) newErrors.notes = 'Please enter notes.';
    if (!date) newErrors.date = 'Please select a date.';

    // If there are validation errors, update state and return
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onAdd({
      id: Date.now(), // Generate a unique ID
      title,
      notes,
      date,
      tags: tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean),
    });

    // Reset form fields
    setTitle('');
    setNotes('');
    setDate('');
    setTags('');
    onClose();
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() =>
        document
          .getElementById('add-training-entry-form')
          ?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
      }
      title="New Training Entry"
      description="All fields are required."
      formId="add-training-entry-form"
      saveLabel={
        <>
          <Plus className="mr-2 h-4 w-4" /> Add
        </>
      }
    >
      <form id="add-training-entry-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Title" fieldId="trainingTitle" required error={errors.title}>
          <Input
            id="trainingTitle"
            type="text"
            value={title}
            onChange={e => handleTitleChange(e.target.value)}
            required
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? 'trainingTitle-error' : undefined}
            className={errors.title ? 'border-destructive focus-visible:ring-destructive' : ''}
          />
        </FormField>
        <FormField label="Notes" fieldId="trainingNotes" required error={errors.notes}>
          <Textarea
            id="trainingNotes"
            value={notes}
            onChange={e => handleNotesChange(e.target.value)}
            required
            aria-invalid={!!errors.notes}
            aria-describedby={errors.notes ? 'trainingNotes-error' : undefined}
            className={errors.notes ? 'border-destructive focus-visible:ring-destructive' : ''}
          />
        </FormField>
        <FormField label="Date" fieldId="trainingDate" required error={errors.date}>
          <DatePickerField value={date} onChange={handleDateChange} required />
        </FormField>
        <FormField label="Tags" fieldId="trainingTags" hint="Comma separated">
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

export default AddTrainingEntryDialog;
