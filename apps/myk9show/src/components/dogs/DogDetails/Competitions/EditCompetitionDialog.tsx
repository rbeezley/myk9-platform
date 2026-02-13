import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.date || !form.location) return;
    onSave({ ...initialData, ...form });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Competition Entry</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-comp-name">
              Competition Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="edit-comp-name"
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., AKC Agility Trial"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-comp-date">
              Date <span className="text-red-500">*</span>
            </Label>
            <Input
              id="edit-comp-date"
              type="date"
              value={form.date}
              onChange={(e) => setForm(prev => ({ ...prev, date: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-comp-location">
              Location <span className="text-red-500">*</span>
            </Label>
            <Input
              id="edit-comp-location"
              value={form.location}
              onChange={(e) => setForm(prev => ({ ...prev, location: e.target.value }))}
              placeholder="e.g., Springfield Fairgrounds"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-comp-status">Status</Label>
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
          </div>

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
