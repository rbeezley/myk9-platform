import React from 'react';
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
import type { Show } from '@/types/show-types';

interface EditExternalShowDialogProps {
  open: boolean;
  show: Show | null;
  onClose: () => void;
  onSave: (show: Show) => void;
  onDelete?: () => void;
}

const EditExternalShowDialog: React.FC<EditExternalShowDialogProps> = ({ open, show, onClose, onSave, onDelete }) => {
  const [name, setName] = React.useState('');
  const [date, setDate] = React.useState('');
  const [location, setLocation] = React.useState('');
  const [events, setEvents] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState('Entry Pending');
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Sync form state with show prop - using render-time state update pattern
  const showId = show?.id || '';
  const [lastShowId, setLastShowId] = React.useState(showId);
  if (showId !== lastShowId && show) {
    setLastShowId(showId);
    setName(show.name || '');
    setDate(show.startDate || '');
    setLocation(show.location || '');
    setEvents(show.events || []);
    setStatus(show.status || 'Entry Pending');
    setErrors({});
  }

  if (!show) return null;

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!name) newErrors.name = 'Please enter a show name';
    if (!date) newErrors.date = 'Please select a date';
    if (!location) newErrors.location = 'Please enter a location';
    return newErrors;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;
    onSave({
      ...show,
      name,
      startDate: date,
      location,
      status,
      events: events.filter(Boolean),
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit External Show</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Show Name" fieldId="editShowName" required error={errors.name}>
            <Input
              id="editShowName"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'editShowName-error' : undefined}
            />
          </FormField>
          <FormField label="Date" fieldId="editShowDate" required error={errors.date}>
            <Input
              id="editShowDate"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              aria-invalid={!!errors.date}
              aria-describedby={errors.date ? 'editShowDate-error' : undefined}
            />
          </FormField>
          <FormField label="Location" fieldId="editShowLocation" required error={errors.location}>
            <Input
              id="editShowLocation"
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              aria-invalid={!!errors.location}
              aria-describedby={errors.location ? 'editShowLocation-error' : undefined}
            />
          </FormField>
          <FormField label="Events (comma separated)" fieldId="editShowEvents">
            <Input
              id="editShowEvents"
              type="text"
              value={events.join(', ')}
              onChange={e => setEvents(e.target.value.split(',').map(t => t.trim()))}
            />
          </FormField>
          <FormField label="Status" fieldId="editShowStatus">
            <Select value={status} onValueChange={val => setStatus(val)}>
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
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            {onDelete && (
              <Button type="button" variant="destructive" onClick={onDelete}>Delete</Button>
            )}
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditExternalShowDialog;
