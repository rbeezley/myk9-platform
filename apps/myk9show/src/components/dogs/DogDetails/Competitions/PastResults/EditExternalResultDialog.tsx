import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { useFormValidation } from '@/hooks/useFormValidation';
import { z } from 'zod';
import type { ExternalResult } from './AddExternalResultDialog';

const externalResultSchema = z.object({
  name: z.string().min(1, 'Please enter a show name'),
  date: z.string().min(1, 'Please select a date'),
  location: z.string().min(1, 'Please enter a location'),
  className: z.string().min(1, 'Please enter a class'),
  resultText: z.string().min(1, 'Please enter a result'),
  tags: z.string().optional().default(''),
  status: z.string().min(1, 'Please select a status'),
});

type ExternalResultFormData = z.infer<typeof externalResultSchema>;

interface EditExternalResultDialogProps {
  open: boolean;
  result: ExternalResult | null;
  onClose: () => void;
  onSave: (result: ExternalResult) => void;
}

const defaultData: ExternalResultFormData = {
  name: '',
  date: '',
  location: '',
  className: '',
  resultText: '',
  tags: '',
  status: 'Completed',
};

const EditExternalResultDialog: React.FC<EditExternalResultDialogProps> = ({
  open,
  result,
  onClose,
  onSave,
}) => {
  const form = useFormValidation(externalResultSchema, defaultData);

  // Sync form state with result prop - using render-time state update pattern
  const resultId = result?.id?.toString() || '';
  const [lastResultId, setLastResultId] = React.useState(resultId);
  if (resultId !== lastResultId && result) {
    setLastResultId(resultId);
    form.reset({
      name: result.name,
      date: result.date,
      location: result.location,
      className: result.className || '',
      resultText: result.result,
      tags: (result.tags || []).join(', '),
      status: result.status,
    });
  }

  const handleSave = form.handleSubmit(data => {
    if (!result) return;
    onSave({
      ...result,
      name: data.name,
      date: data.date,
      location: data.location,
      className: data.className,
      result: data.resultText,
      tags: (data.tags || '')
        .split(',')
        .map(t => t.trim())
        .filter(Boolean),
      status: data.status,
    });
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit External Result</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground mb-2">
          <span className="text-destructive">*</span> All fields except Tags are required
        </div>
        <div className="flex flex-col gap-4">
          <FormField
            label="Show Name"
            fieldId="editResultName"
            required
            error={form.getError('name')}
          >
            <Input
              id="editResultName"
              type="text"
              value={form.data.name}
              onChange={e => form.setValue('name', e.target.value)}
              onBlur={() => form.touchField('name')}
              {...form.getFieldProps('name')}
            />
          </FormField>
          <FormField label="Date" fieldId="editResultDate" required error={form.getError('date')}>
            <Input
              id="editResultDate"
              type="date"
              value={form.data.date}
              onChange={e => form.setValue('date', e.target.value)}
              onBlur={() => form.touchField('date')}
              {...form.getFieldProps('date')}
            />
          </FormField>
          <FormField
            label="Location"
            fieldId="editResultLocation"
            required
            error={form.getError('location')}
          >
            <Input
              id="editResultLocation"
              type="text"
              value={form.data.location}
              onChange={e => form.setValue('location', e.target.value)}
              onBlur={() => form.touchField('location')}
              {...form.getFieldProps('location')}
            />
          </FormField>
          <FormField
            label="Class"
            fieldId="editResultClassName"
            required
            error={form.getError('className')}
          >
            <Input
              id="editResultClassName"
              type="text"
              value={form.data.className}
              onChange={e => form.setValue('className', e.target.value)}
              onBlur={() => form.touchField('className')}
              {...form.getFieldProps('className')}
            />
          </FormField>
          <FormField
            label="Result"
            fieldId="editResultText"
            required
            error={form.getError('resultText')}
          >
            <Input
              id="editResultText"
              type="text"
              value={form.data.resultText}
              onChange={e => form.setValue('resultText', e.target.value)}
              onBlur={() => form.touchField('resultText')}
              {...form.getFieldProps('resultText')}
            />
          </FormField>
          <FormField label="Tags (comma separated)" fieldId="editResultTags">
            <Input
              id="editResultTags"
              type="text"
              value={form.data.tags ?? ''}
              onChange={e => form.setValue('tags', e.target.value)}
            />
          </FormField>
          <FormField
            label="Status"
            fieldId="editResultStatus"
            required
            error={form.getError('status')}
          >
            <Select value={form.data.status} onValueChange={val => form.setValue('status', val)}>
              <SelectTrigger id="editResultStatus" {...form.getFieldProps('status')}>
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
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave}>
              Save
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditExternalResultDialog;
