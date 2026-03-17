import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/common/FormField';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ExternalResult } from './AddExternalResultDialog';

interface EditExternalResultDialogProps {
  open: boolean;
  result: ExternalResult | null;
  onClose: () => void;
  onSave: (result: ExternalResult) => void;
}

const EditExternalResultDialog: React.FC<EditExternalResultDialogProps> = ({ open, result, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [className, setClassName] = useState('');
  const [resultText, setResultText] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [status, setStatus] = useState('Completed');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Sync form state with result prop - using render-time state update pattern
  const resultId = result?.id || '';
  const [lastResultId, setLastResultId] = useState(resultId);
  if (resultId !== lastResultId && result) {
    setLastResultId(resultId);
    setName(result.name);
    setDate(result.date);
    setLocation(result.location);
    setClassName(result.className || '');
    setResultText(result.result);
    setTags(result.tags || []);
    setStatus(result.status);
    setErrors({});
  }

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!name) newErrors.name = 'Please enter a show name';
    if (!date) newErrors.date = 'Please select a date';
    if (!location) newErrors.location = 'Please enter a location';
    if (!className) newErrors.className = 'Please enter a class';
    if (!resultText) newErrors.resultText = 'Please enter a result';
    if (!status) newErrors.status = 'Please select a status';
    return newErrors;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!result) return;
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;
    onSave({ ...result, name, date, location, className, result: resultText, tags, status });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit External Result</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground mb-2">
          <span className="text-destructive">*</span> All fields except Tags are required
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Show Name" fieldId="editResultName" required error={errors.name}>
            <Input
              id="editResultName"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'editResultName-error' : undefined}
            />
          </FormField>
          <FormField label="Date" fieldId="editResultDate" required error={errors.date}>
            <Input
              id="editResultDate"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              aria-invalid={!!errors.date}
              aria-describedby={errors.date ? 'editResultDate-error' : undefined}
            />
          </FormField>
          <FormField label="Location" fieldId="editResultLocation" required error={errors.location}>
            <Input
              id="editResultLocation"
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              aria-invalid={!!errors.location}
              aria-describedby={errors.location ? 'editResultLocation-error' : undefined}
            />
          </FormField>
          <FormField label="Class" fieldId="editResultClassName" required error={errors.className}>
            <Input
              id="editResultClassName"
              type="text"
              value={className}
              onChange={e => setClassName(e.target.value)}
              aria-invalid={!!errors.className}
              aria-describedby={errors.className ? 'editResultClassName-error' : undefined}
            />
          </FormField>
          <FormField label="Result" fieldId="editResultText" required error={errors.resultText}>
            <Input
              id="editResultText"
              type="text"
              value={resultText}
              onChange={e => setResultText(e.target.value)}
              aria-invalid={!!errors.resultText}
              aria-describedby={errors.resultText ? 'editResultText-error' : undefined}
            />
          </FormField>
          <FormField label="Tags (comma separated)" fieldId="editResultTags">
            <Input
              id="editResultTags"
              type="text"
              value={tags.join(', ')}
              onChange={e => setTags(e.target.value.split(',').map(t => t.trim()))}
            />
          </FormField>
          <FormField label="Status" fieldId="editResultStatus" required error={errors.status}>
            <Select value={status} onValueChange={val => setStatus(val)}>
              <SelectTrigger
                id="editResultStatus"
                aria-invalid={!!errors.status}
                aria-describedby={errors.status ? 'editResultStatus-error' : undefined}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Completed">Completed</SelectItem>
                <SelectItem value="Disqualified">Disqualified</SelectItem>
                <SelectItem value="Withdrawn">Withdrawn</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditExternalResultDialog;
