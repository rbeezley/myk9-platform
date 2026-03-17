import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { FormField } from '@/components/common/FormField';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus } from 'lucide-react';

export interface ExternalResult {
  id?: number;
  name: string;
  date: string;
  location: string;
  className: string;
  result: string;
  tags: string[];
  status: string;
  source?: string;
}

interface AddExternalResultDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (result: ExternalResult) => void;
}

const AddExternalResultDialog: React.FC<AddExternalResultDialogProps> = ({ open, onClose, onAdd }) => {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [className, setClassName] = useState('');
  const [result, setResult] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [status, setStatus] = useState('Completed');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!name) newErrors.name = 'Please enter a show name';
    if (!date) newErrors.date = 'Please select a date';
    if (!location) newErrors.location = 'Please enter a location';
    if (!className) newErrors.className = 'Please enter a class';
    if (!result) newErrors.result = 'Please enter a result';
    if (!status) newErrors.status = 'Please select a status';
    return newErrors;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;
    onAdd({ name, date, location, className, result, tags, status });
    setName('');
    setDate('');
    setLocation('');
    setClassName('');
    setResult('');
    setTags([]);
    setStatus('Completed');
    setErrors({});
    onClose();
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() => document.getElementById('add-external-result-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))}
      title="Add External Result"
      description="All fields except Tags are required."
      formId="add-external-result-form"
      saveLabel={<><Plus className="mr-2 h-4 w-4" /> Add</>}
    >
      <form id="add-external-result-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Show Name" fieldId="showName" required error={errors.name}>
          <Input
            id="showName"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'showName-error' : undefined}
          />
        </FormField>
        <FormField label="Date" fieldId="date" required error={errors.date}>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            aria-invalid={!!errors.date}
            aria-describedby={errors.date ? 'date-error' : undefined}
          />
        </FormField>
        <FormField label="Location" fieldId="location" required error={errors.location}>
          <Input
            id="location"
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            aria-invalid={!!errors.location}
            aria-describedby={errors.location ? 'location-error' : undefined}
          />
        </FormField>
        <FormField label="Class" fieldId="className" required error={errors.className}>
          <Input
            id="className"
            type="text"
            value={className}
            onChange={e => setClassName(e.target.value)}
            aria-invalid={!!errors.className}
            aria-describedby={errors.className ? 'className-error' : undefined}
          />
        </FormField>
        <FormField label="Result" fieldId="result" required error={errors.result}>
          <Input
            id="result"
            type="text"
            value={result}
            onChange={e => setResult(e.target.value)}
            aria-invalid={!!errors.result}
            aria-describedby={errors.result ? 'result-error' : undefined}
          />
        </FormField>
        <FormField label="Tags (comma separated)" fieldId="tags">
          <Input
            id="tags"
            type="text"
            value={tags.join(', ')}
            onChange={e => setTags(e.target.value.split(',').map(t => t.trim()))}
          />
        </FormField>
        <FormField label="Status" fieldId="status" required error={errors.status}>
          <Select value={status} onValueChange={val => setStatus(val)}>
            <SelectTrigger
              id="status"
              aria-invalid={!!errors.status}
              aria-describedby={errors.status ? 'status-error' : undefined}
            >
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Completed">Completed</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Disqualified">Disqualified</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </form>
    </StandardDialog>
  );
};

export default AddExternalResultDialog;
