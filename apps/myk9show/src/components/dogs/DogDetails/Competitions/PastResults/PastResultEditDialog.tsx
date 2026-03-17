import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { FormField } from '@/components/common/FormField';
import { Input } from '@/components/ui/input';
import DatePickerField from '@/components/common/DatePickerField';
import { Textarea } from '@/components/ui/textarea';
import type { PastResult } from '@/types/results-types';

interface PastResultEditDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (result: PastResult) => void;
  initialResult?: PastResult | undefined;
}

const DEFAULT_FORM: PastResult = {
  id: '',
  showName: '',
  date: '',
  judge: '',
  className: '',
  placement: '',
  notes: '',
};

const PastResultEditDialog: React.FC<PastResultEditDialogProps> = ({ open, onClose, onSave, initialResult }) => {
  const [form, setForm] = useState<PastResult>(initialResult || DEFAULT_FORM);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [wasOpen, setWasOpen] = useState(open);
  const [lastInitialResult, setLastInitialResult] = useState(initialResult);

  // Reset form when dialog opens or initialResult changes
  if (open && (!wasOpen || initialResult !== lastInitialResult)) {
    setWasOpen(open);
    setLastInitialResult(initialResult);
    if (initialResult) {
      setForm({
        ...initialResult,
        date: initialResult.date || '',
      });
    } else {
      setForm(DEFAULT_FORM);
    }
    setErrors({});
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };


  const validate = () => {
    const newErrors: { [key: string]: string } = {};
    if (!form.showName) newErrors.showName = 'Please enter a show name';
    if (!form.date) newErrors.date = 'Please select a date';
    if (!form.className) newErrors.className = 'Please enter a class';
    if (!form.placement) newErrors.placement = 'Please enter a placement';
    return newErrors;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length === 0) {
      onSave(form);
      onClose();
    }
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() => document.getElementById('past-result-edit-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))}
      title={initialResult ? 'Edit Past Result' : 'Add Past Result'}
      description={initialResult ? 'Edit the details of this past result.' : 'Enter details for the new past result.'}
      formId="past-result-edit-form"
    >
      <form id="past-result-edit-form" className="space-y-4" onSubmit={handleSubmit}>
        <FormField label="Show Name" fieldId="showName" required error={errors.showName}>
          <Input
            id="showName"
            name="showName"
            value={form.showName}
            onChange={handleChange}
            aria-invalid={!!errors.showName}
            aria-describedby={errors.showName ? 'showName-error' : undefined}
          />
        </FormField>
        <FormField label="Date" fieldId="date" required error={errors.date}>
          <DatePickerField
            value={form.date}
            onChange={(value) => setForm(prev => ({ ...prev, date: value }))}
            required
            name="date"
            id="date"
          />
        </FormField>
        <FormField label="Judge" fieldId="judge">
          <Input
            id="judge"
            name="judge"
            value={form.judge}
            onChange={handleChange}
          />
        </FormField>
        <FormField label="Class" fieldId="className" required error={errors.className}>
          <Input
            id="className"
            name="className"
            value={form.className}
            onChange={handleChange}
            aria-invalid={!!errors.className}
            aria-describedby={errors.className ? 'className-error' : undefined}
          />
        </FormField>
        <FormField label="Placement" fieldId="placement" required error={errors.placement}>
          <Input
            id="placement"
            name="placement"
            value={form.placement}
            onChange={handleChange}
            aria-invalid={!!errors.placement}
            aria-describedby={errors.placement ? 'placement-error' : undefined}
          />
        </FormField>
        <FormField label="Notes" fieldId="notes">
          <Textarea
            id="notes"
            name="notes"
            value={form.notes}
            onChange={handleChange}
            rows={3}
          />
        </FormField>
      </form>
    </StandardDialog>
  );
};

export default PastResultEditDialog;
