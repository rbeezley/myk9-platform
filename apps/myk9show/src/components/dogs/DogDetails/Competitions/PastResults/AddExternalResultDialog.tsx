import React from 'react';
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
import { useFormValidation } from '@/hooks/useFormValidation';
import { z } from 'zod';

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

const externalResultSchema = z.object({
  name: z.string().min(1, 'Please enter a show name'),
  date: z.string().min(1, 'Please select a date'),
  location: z.string().min(1, 'Please enter a location'),
  className: z.string().min(1, 'Please enter a class'),
  result: z.string().min(1, 'Please enter a result'),
  tags: z.string().optional().default(''),
  status: z.string().min(1, 'Please select a status'),
});

type ExternalResultFormData = z.infer<typeof externalResultSchema>;

interface AddExternalResultDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (result: ExternalResult) => void;
}

const defaultData: ExternalResultFormData = {
  name: '',
  date: '',
  location: '',
  className: '',
  result: '',
  tags: '',
  status: 'Completed',
};

const AddExternalResultDialog: React.FC<AddExternalResultDialogProps> = ({
  open,
  onClose,
  onAdd,
}) => {
  const form = useFormValidation(externalResultSchema, defaultData);

  // Reset form when dialog opens - using render-time state update pattern
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      form.reset(defaultData);
    }
  }

  const handleSave = form.handleSubmit(data => {
    onAdd({
      name: data.name,
      date: data.date,
      location: data.location,
      className: data.className,
      result: data.result,
      tags: (data.tags || '')
        .split(',')
        .map(t => t.trim())
        .filter(Boolean),
      status: data.status,
    });
    form.reset(defaultData);
    onClose();
  });

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={handleSave}
      title="Add External Result"
      description="All fields except Tags are required."
      saveLabel={
        <>
          <Plus className="mr-2 h-4 w-4" /> Add
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Show Name" fieldId="showName" required error={form.getError('name')}>
          <Input
            id="showName"
            type="text"
            value={form.data.name}
            onChange={e => form.setValue('name', e.target.value)}
            onBlur={() => form.touchField('name')}
            {...form.getFieldProps('name')}
          />
        </FormField>
        <FormField label="Date" fieldId="date" required error={form.getError('date')}>
          <Input
            id="date"
            type="date"
            value={form.data.date}
            onChange={e => form.setValue('date', e.target.value)}
            onBlur={() => form.touchField('date')}
            {...form.getFieldProps('date')}
          />
        </FormField>
        <FormField label="Location" fieldId="location" required error={form.getError('location')}>
          <Input
            id="location"
            type="text"
            value={form.data.location}
            onChange={e => form.setValue('location', e.target.value)}
            onBlur={() => form.touchField('location')}
            {...form.getFieldProps('location')}
          />
        </FormField>
        <FormField label="Class" fieldId="className" required error={form.getError('className')}>
          <Input
            id="className"
            type="text"
            value={form.data.className}
            onChange={e => form.setValue('className', e.target.value)}
            onBlur={() => form.touchField('className')}
            {...form.getFieldProps('className')}
          />
        </FormField>
        <FormField label="Result" fieldId="result" required error={form.getError('result')}>
          <Input
            id="result"
            type="text"
            value={form.data.result}
            onChange={e => form.setValue('result', e.target.value)}
            onBlur={() => form.touchField('result')}
            {...form.getFieldProps('result')}
          />
        </FormField>
        <FormField label="Tags (comma separated)" fieldId="tags">
          <Input
            id="tags"
            type="text"
            value={form.data.tags ?? ''}
            onChange={e => form.setValue('tags', e.target.value)}
          />
        </FormField>
        <FormField label="Status" fieldId="status" required error={form.getError('status')}>
          <Select value={form.data.status} onValueChange={val => form.setValue('status', val)}>
            <SelectTrigger id="status" {...form.getFieldProps('status')}>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Completed">Completed</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Disqualified">Disqualified</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </div>
    </StandardDialog>
  );
};

export default AddExternalResultDialog;
