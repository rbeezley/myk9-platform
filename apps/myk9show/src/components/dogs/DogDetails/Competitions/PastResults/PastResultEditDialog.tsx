import React, { useState, useEffect } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import RequiredLabel from '@/components/common/RequiredLabel';
import { Input } from '@/components/ui/input';
import DatePickerField from '@/components/common/DatePickerField';
import { Textarea } from '@/components/ui/textarea';
import type { PastResult } from '@/types/results-types';

interface PastResultEditDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (result: PastResult) => void;
  initialResult?: PastResult;
}

const PastResultEditDialog: React.FC<PastResultEditDialogProps> = ({ open, onClose, onSave, initialResult }) => {
  const [form, setForm] = useState<PastResult>(
    initialResult || {
      id: '',
      showName: '',
      date: '',
      judge: '',
      className: '',
      placement: '',
      notes: '',
    }
  );
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (open && initialResult) {
      setForm({
        ...initialResult,
        date: initialResult.date || '',
      });
    } else if (open && !initialResult) {
      setForm({
        id: '',
        showName: '',
        date: '',
        judge: '',
        className: '',
        placement: '',
        notes: '',
      });
    }
  }, [open, initialResult]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };


  const validate = () => {
    const newErrors: { [key: string]: string } = {};
    if (!form.showName) newErrors.showName = 'Show Name is required';
    if (!form.date) newErrors.date = 'Date is required';
    if (!form.className) newErrors.className = 'Class is required';
    if (!form.placement) newErrors.placement = 'Placement is required';
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
        <div>
          <RequiredLabel required>Show Name</RequiredLabel>
          <Input
            id="showName"
            name="showName"
            value={form.showName}
            onChange={handleChange}
            required
          />
          {errors.showName && <div className="text-red-500 text-xs mt-1">{errors.showName}</div>}
        </div>
        <div>
          <RequiredLabel required>Date</RequiredLabel>
          <DatePickerField
            value={form.date}
            onChange={(value) => setForm(prev => ({ ...prev, date: value }))}
            required
            name="date"
            id="date"
          />
          {errors.date && <div className="text-red-500 text-xs mt-1">{errors.date}</div>}
        </div>
        <div>
          <RequiredLabel required>Judge</RequiredLabel>
          <Input
            id="judge"
            name="judge"
            value={form.judge}
            onChange={handleChange}
          />
        </div>
        <div>
          <RequiredLabel required>Class</RequiredLabel>
          <Input
            id="className"
            name="className"
            value={form.className}
            onChange={handleChange}
            required
          />
          {errors.className && <div className="text-red-500 text-xs mt-1">{errors.className}</div>}
        </div>
        <div>
          <RequiredLabel required>Placement</RequiredLabel>
          <Input
            id="placement"
            name="placement"
            value={form.placement}
            onChange={handleChange}
            required
          />
          {errors.placement && <div className="text-red-500 text-xs mt-1">{errors.placement}</div>}
        </div>
        <div>
          <label htmlFor="notes" className="block font-medium text-sm">Notes</label>
          <Textarea
            id="notes"
            name="notes"
            value={form.notes}
            onChange={handleChange}
            rows={3}
          />
        </div>
      </form>
    </StandardDialog>
  );
};

export default PastResultEditDialog;
