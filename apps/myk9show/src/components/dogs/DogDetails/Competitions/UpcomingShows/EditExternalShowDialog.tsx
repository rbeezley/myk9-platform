import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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

  React.useEffect(() => {
    if (show) {
      setName(show.name || '');
      setDate(show.startDate || '');
      setLocation(show.location || '');
      setEvents(show.events || []);
      setStatus(show.status || 'Entry Pending');
    }
  }, [show]);

  if (!show) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !date || !location) return;
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
          <div>
            <label className="block mb-1 font-medium">Show Name</label>
            <input type="text" className="w-full border rounded px-3 py-2" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div>
            <label className="block mb-1 font-medium">Date</label>
            <input 
              type="date" 
              className="w-full border rounded px-3 py-2" 
              value={date} 
              onChange={e => setDate(e.target.value)} 
              required 
            />
          </div>
          <div>
            <label className="block mb-1 font-medium">Location</label>
            <input type="text" className="w-full border rounded px-3 py-2" value={location} onChange={e => setLocation(e.target.value)} required />
          </div>
          <div>
            <label className="block mb-1 font-medium">Events (comma separated)</label>
            <input type="text" className="w-full border rounded px-3 py-2" value={events.join(', ')} onChange={e => setEvents(e.target.value.split(',').map(t => t.trim()))} />
          </div>
          <div>
            <label className="block mb-1 font-medium">Status</label>
            <select className="w-full border rounded px-3 py-2" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="Entry Pending">Entry Pending</option>
              <option value="Entry Confirmed">Entry Confirmed</option>
              <option value="Withdrawn">Withdrawn</option>
              <option value="Waitlisted">Waitlisted</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
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
