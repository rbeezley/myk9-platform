import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/FormField';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface CompetitionFormData {
  name: string;
  date: string;
  location: string;
  status: 'Upcoming' | 'Completed' | 'Cancelled';
}

interface EditCompetitionDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
  initialData?: Record<string, unknown>;
}

const EditCompetitionDialog: React.FC<EditCompetitionDialogProps> = ({ open, onClose, onSave, initialData }) => {
  const [form, setForm] = useState<CompetitionFormData>(() => ({
    name: String(initialData?.name || ''),
    date: String(initialData?.date || ''),
    location: String(initialData?.location || ''),
    status: (initialData?.status as CompetitionFormData['status']) || 'Upcoming',
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [lastInitialId, setLastInitialId] = useState(String(initialData?.id || ''));
  const currentId = String(initialData?.id || '');
  if (currentId !== lastInitialId && initialData) {
    setLastInitialId(currentId);
    setForm({
      name: String(initialData.name || ''),
      date: String(initialData.date || ''),
      location: String(initialData.location || ''),
      status: (initialData.status as CompetitionFormData['status']) || 'Upcoming',
    });
    setErrors({});
  }

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.name) newErrors.name = 'Please enter a competition name';
    if (!form.date) newErrors.date = 'Please select a date';
    if (!form.location) newErrors.location = 'Please enter a location';
    return newErrors;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;
    onSave({ ...initialData, ...form });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Competition Entry</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Competition Name" fieldId="edit-comp-name" required error={errors.name}>
            <Input
              id="edit-comp-name"
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., AKC Agility Trial"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'edit-comp-name-error' : undefined}
            />
          </FormField>

          <FormField label="Date" fieldId="edit-comp-date" required error={errors.date}>
            <Input
              id="edit-comp-date"
              type="date"
              value={form.date}
              onChange={(e) => setForm(prev => ({ ...prev, date: e.target.value }))}
              aria-invalid={!!errors.date}
              aria-describedby={errors.date ? 'edit-comp-date-error' : undefined}
            />
          </FormField>

          <FormField label="Location" fieldId="edit-comp-location" required error={errors.location}>
            <Input
              id="edit-comp-location"
              value={form.location}
              onChange={(e) => setForm(prev => ({ ...prev, location: e.target.value }))}
              placeholder="e.g., Springfield Fairgrounds"
              aria-invalid={!!errors.location}
              aria-describedby={errors.location ? 'edit-comp-location-error' : undefined}
            />
          </FormField>

          <FormField label="Status" fieldId="edit-comp-status">
            <Select
              value={form.status}
              onValueChange={(value) => setForm(prev => ({ ...prev, status: value as CompetitionFormData['status'] }))}
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
              <Button variant="outline" type="button">Cancel</Button>
            </DialogClose>
            <Button type="submit">Save Changes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditCompetitionDialog;
