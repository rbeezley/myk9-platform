import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import RequiredLabel from '@/components/common/RequiredLabel';
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

const AddTrainingEntryDialog: React.FC<AddTrainingEntryDialogProps> = ({ open, onClose, onAdd }) => {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState<string>("");
  const [tags, setTags] = useState('');

  // Form validation state
  const [errors, setErrors] = useState<{
    title?: string;
    notes?: string;
    date?: string;
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
    const newErrors: {[key: string]: string} = {};
    if (!title) newErrors.title = "Title is required";
    if (!notes) newErrors.notes = "Notes are required";
    if (!date) newErrors.date = "Date is required";
    
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
      tags: tags.split(',').map(t => t.trim()).filter(Boolean) 
    });
    
    // Reset form fields
    setTitle('');
    setNotes('');
    setDate("");
    setTags('');
    onClose();
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() => document.getElementById('add-training-entry-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))}
      title="New Training Entry"
      description="All fields are required."
      formId="add-training-entry-form"
      saveLabel={<><Plus className="mr-2 h-4 w-4" /> Add</>}
    >
      <form id="add-training-entry-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <RequiredLabel required>Title</RequiredLabel>
          <Input
            type="text"
            value={title}
            onChange={e => handleTitleChange(e.target.value)}
            required
            className={errors.title ? "border-red-500 focus-visible:ring-red-500" : ""}
          />
          {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
        </div>
        <div>
          <RequiredLabel required>Notes</RequiredLabel>
          <Textarea
            value={notes}
            onChange={e => handleNotesChange(e.target.value)}
            required
            className={errors.notes ? "border-red-500 focus-visible:ring-red-500" : ""}
          />
          {errors.notes && <p className="text-red-500 text-xs mt-1">{errors.notes}</p>}
        </div>
        <div>
          <DatePickerField
            label="Date"
            value={date}
            onChange={handleDateChange}
            required
          />
          {errors.date && <p className="text-red-500 text-xs mt-1">{errors.date}</p>}
        </div>
        <div>
          <RequiredLabel>Tags <span className="text-muted-foreground">(comma separated)</span></RequiredLabel>
          <Input type="text" value={tags} onChange={e => setTags(e.target.value)} placeholder="e.g. Obedience, Progress" />
        </div>
      </form>
    </StandardDialog>
  );
};

export default AddTrainingEntryDialog;
