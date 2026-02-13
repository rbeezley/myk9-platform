import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ORGANIZATIONS } from '@/types/achievement';

interface TitleFormData {
  title: string;
  organization: string;
  dateEarned: string;
  status: string;
}

interface EditTitleDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
  initialData?: Record<string, unknown>;
}

const EditTitleDialog: React.FC<EditTitleDialogProps> = ({ open, onClose, onSave, initialData }) => {
  const [form, setForm] = useState<TitleFormData>(() => ({
    title: String(initialData?.title || ''),
    organization: String(initialData?.organization || 'AKC'),
    dateEarned: String(initialData?.dateEarned || ''),
    status: String(initialData?.status || 'Awarded'),
  }));

  const [lastInitialId, setLastInitialId] = useState(String(initialData?.id || ''));
  const currentId = String(initialData?.id || '');
  if (currentId !== lastInitialId && initialData) {
    setLastInitialId(currentId);
    setForm({
      title: String(initialData.title || ''),
      organization: String(initialData.organization || 'AKC'),
      dateEarned: String(initialData.dateEarned || ''),
      status: String(initialData.status || 'Awarded'),
    });
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.dateEarned) return;
    onSave({ ...initialData, ...form });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Title</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-title-name">
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="edit-title-name"
              value={form.title}
              onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
              placeholder="e.g., CGC, Rally Novice"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-title-org">
              Organization <span className="text-red-500">*</span>
            </Label>
            <Select
              value={form.organization}
              onValueChange={(value) => setForm(prev => ({ ...prev, organization: value }))}
            >
              <SelectTrigger id="edit-title-org">
                <SelectValue placeholder="Select organization" />
              </SelectTrigger>
              <SelectContent>
                {ORGANIZATIONS.map((org) => (
                  <SelectItem key={org} value={org}>{org}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-title-date">
              Date Earned <span className="text-red-500">*</span>
            </Label>
            <Input
              id="edit-title-date"
              type="date"
              value={form.dateEarned}
              onChange={(e) => setForm(prev => ({ ...prev, dateEarned: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-title-status">Status</Label>
            <Select
              value={form.status}
              onValueChange={(value) => setForm(prev => ({ ...prev, status: value }))}
            >
              <SelectTrigger id="edit-title-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Awarded">Awarded</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Revoked">Revoked</SelectItem>
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

export default EditTitleDialog;
