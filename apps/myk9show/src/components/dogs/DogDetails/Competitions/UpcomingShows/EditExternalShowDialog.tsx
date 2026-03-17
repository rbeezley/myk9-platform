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
import type { Show } from '@/types/show-types';

const externalShowSchema = z.object({
  name: z.string().min(1, 'Please enter a show name'),
  date: z.string().min(1, 'Please select a date'),
  location: z.string().min(1, 'Please enter a location'),
  events: z.string().optional().default(''),
  status: z.string().min(1),
});

type ExternalShowFormData = z.infer<typeof externalShowSchema>;

interface EditExternalShowDialogProps {
  open: boolean;
  show: Show | null;
  onClose: () => void;
  onSave: (show: Show) => void;
  onDelete?: () => void;
}

const defaultData: ExternalShowFormData = {
  name: '',
  date: '',
  location: '',
  events: '',
  status: 'Entry Pending',
};

const EditExternalShowDialog: React.FC<EditExternalShowDialogProps> = ({
  open,
  show,
  onClose,
  onSave,
  onDelete,
}) => {
  const form = useFormValidation(externalShowSchema, defaultData);

  // Sync form state with show prop - using render-time state update pattern
  const showId = show?.id || '';
  const [lastShowId, setLastShowId] = React.useState(showId);
  if (showId !== lastShowId && show) {
    setLastShowId(showId);
    form.reset({
      name: show.name || '',
      date: show.startDate || '',
      location: show.location || '',
      events: (show.events || []).join(', '),
      status: show.status || 'Entry Pending',
    });
  }

  if (!show) return null;

  const handleSave = form.handleSubmit(data => {
    onSave({
      ...show,
      name: data.name,
      startDate: data.date,
      location: data.location,
      status: data.status,
      events: (data.events || '')
        .split(',')
        .map(t => t.trim())
        .filter(Boolean),
    });
    onClose();
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit External Show</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <FormField
            label="Show Name"
            fieldId="editShowName"
            required
            error={form.getError('name')}
          >
            <Input
              id="editShowName"
              type="text"
              value={form.data.name}
              onChange={e => form.setValue('name', e.target.value)}
              onBlur={() => form.touchField('name')}
              {...form.getFieldProps('name')}
            />
          </FormField>
          <FormField label="Date" fieldId="editShowDate" required error={form.getError('date')}>
            <Input
              id="editShowDate"
              type="date"
              value={form.data.date}
              onChange={e => form.setValue('date', e.target.value)}
              onBlur={() => form.touchField('date')}
              {...form.getFieldProps('date')}
            />
          </FormField>
          <FormField
            label="Location"
            fieldId="editShowLocation"
            required
            error={form.getError('location')}
          >
            <Input
              id="editShowLocation"
              type="text"
              value={form.data.location}
              onChange={e => form.setValue('location', e.target.value)}
              onBlur={() => form.touchField('location')}
              {...form.getFieldProps('location')}
            />
          </FormField>
          <FormField label="Events (comma separated)" fieldId="editShowEvents">
            <Input
              id="editShowEvents"
              type="text"
              value={form.data.events ?? ''}
              onChange={e => form.setValue('events', e.target.value)}
            />
          </FormField>
          <FormField label="Status" fieldId="editShowStatus">
            <Select value={form.data.status} onValueChange={val => form.setValue('status', val)}>
              <SelectTrigger id="editShowStatus">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Entry Pending">Entry Pending</SelectItem>
                <SelectItem value="Entry Confirmed">Entry Confirmed</SelectItem>
                <SelectItem value="Withdrawn">Withdrawn</SelectItem>
                <SelectItem value="Waitlisted">Waitlisted</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            {onDelete && (
              <Button type="button" variant="destructive" onClick={onDelete}>
                Delete
              </Button>
            )}
            <Button type="button" onClick={handleSave}>
              Save
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditExternalShowDialog;
