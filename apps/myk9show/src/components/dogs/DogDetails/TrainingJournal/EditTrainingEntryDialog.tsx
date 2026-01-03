import React, { useState, useEffect } from 'react';
import { DatePicker } from '@/components/ui/date-picker';
import StandardDialog from '@/components/common/StandardDialog';
import RequiredLabel from '@/components/common/RequiredLabel';
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

  useEffect(() => {
    if (entry) {
      setTitle(entry.title);
      setNotes(entry.notes);
      setDate(entry.date);
      setTags(entry.tags ? entry.tags.join(', ') : '');
    }
  }, [entry]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!entry) return;
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
      <div className="text-xs text-muted-foreground mb-2">
        <span className="text-red-500">*</span> All fields are required
      </div>
      <form id="edit-training-entry-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <RequiredLabel>Title</RequiredLabel>
          <input type="text" className="w-full border rounded px-3 py-2" value={title} onChange={e => setTitle(e.target.value)} required />
        </div>
        <div>
          <RequiredLabel>Notes</RequiredLabel>
          <textarea className="w-full border rounded px-3 py-2" value={notes} onChange={e => setNotes(e.target.value)} required />
        </div>
        <div>
          <RequiredLabel>Date</RequiredLabel>
          <DatePicker
            date={date ? parseLocalDateString(date) : undefined}
            setDate={(newDate) => setDate(newDate ? formatDateLocal(newDate) : '')}
            required
            className="dialog-input-bg w-full"
            id="trainingEntryDate"
            name="date"
            placeholder="YYYY-MM-DD"
          />
        </div>
        <div>
          <label className="block mb-1 font-medium">Tags <span className="text-muted-foreground">(comma separated)</span></label>
          <input type="text" className="w-full border rounded px-3 py-2" value={""} onChange={e => setTags(e.target.value)} placeholder="e.g. Obedience, Progress" />
        </div>
      </form>
    </StandardDialog>
  );
};

export default EditTrainingEntryDialog;
