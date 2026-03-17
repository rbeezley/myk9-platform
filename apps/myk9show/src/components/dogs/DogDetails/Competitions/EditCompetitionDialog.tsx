import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/FormField';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFormValidation } from '@/hooks/useFormValidation';
import { z } from 'zod';

const competitionSchema = z.object({
  name: z.string().min(1, 'Please enter a competition name'),
  date: z.string().min(1, 'Please select a date'),
  location: z.string().min(1, 'Please enter a location'),
  status: z.enum(['Upcoming', 'Completed', 'Cancelled']),
});

type CompetitionFormData = z.infer<typeof competitionSchema>;

interface EditCompetitionDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
  initialData?: Record<string, unknown>;
}

const EditCompetitionDialog: React.FC<EditCompetitionDialogProps> = ({
  open,
  onClose,
  onSave,
  initialData,
}) => {
  const buildFormData = (data?: Record<string, unknown>): CompetitionFormData => ({
    name: String(data?.name || ''),
    date: String(data?.date || ''),
    location: String(data?.location || ''),
    status: (data?.status as CompetitionFormData['status']) || 'Upcoming',
  });

  const form = useFormValidation(competitionSchema, buildFormData(initialData));

  // Sync form state with initialData prop - using render-time state update pattern
  const [lastInitialId, setLastInitialId] = React.useState(String(initialData?.id || ''));
  const currentId = String(initialData?.id || '');
  if (currentId !== lastInitialId && initialData) {
    setLastInitialId(currentId);
    form.reset(buildFormData(initialData));
  }

  const handleSave = form.handleSubmit(data => {
    onSave({ ...initialData, ...data });
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Competition Entry</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <FormField
            label="Competition Name"
            fieldId="edit-comp-name"
            required
            error={form.getError('name')}
          >
            <Input
              id="edit-comp-name"
              value={form.data.name}
              onChange={e => form.setValue('name', e.target.value)}
              onBlur={() => form.touchField('name')}
              placeholder="e.g., AKC Agility Trial"
              {...form.getFieldProps('name')}
            />
          </FormField>

          <FormField label="Date" fieldId="edit-comp-date" required error={form.getError('date')}>
            <Input
              id="edit-comp-date"
              type="date"
              value={form.data.date}
              onChange={e => form.setValue('date', e.target.value)}
              onBlur={() => form.touchField('date')}
              {...form.getFieldProps('date')}
            />
          </FormField>

          <FormField
            label="Location"
            fieldId="edit-comp-location"
            required
            error={form.getError('location')}
          >
            <Input
              id="edit-comp-location"
              value={form.data.location}
              onChange={e => form.setValue('location', e.target.value)}
              onBlur={() => form.touchField('location')}
              placeholder="e.g., Springfield Fairgrounds"
              {...form.getFieldProps('location')}
            />
          </FormField>

          <FormField label="Status" fieldId="edit-comp-status">
            <Select
              value={form.data.status}
              onValueChange={value => form.setValue('status', value)}
            >
              <SelectTrigger id="edit-comp-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Upcoming">Upcoming</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" onClick={handleSave}>
              Save Changes
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditCompetitionDialog;
