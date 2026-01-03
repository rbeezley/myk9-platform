import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { ExternalResult } from './AddExternalResultDialog';

interface EditExternalResultDialogProps {
  open: boolean;
  result: ExternalResult | null;
  onClose: () => void;
  onSave: (result: ExternalResult) => void;
}

const EditExternalResultDialog: React.FC<EditExternalResultDialogProps> = ({ open, result, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [className, setClassName] = useState('');
  const [resultText, setResultText] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [status, setStatus] = useState('Completed');

  useEffect(() => {
    if (result) {
      setName(result.name);
      setDate(result.date);
      setLocation(result.location);
      setClassName(result.className || '');
      setResultText(result.result);
      setTags(result.tags || []);
      setStatus(result.status);
    }
  }, [result]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!result) return;
    onSave({ ...result, name, date, location, className, result: resultText, tags, status });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit External Result</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground mb-2">
          <span className="text-red-500">*</span> All fields except Tags are required
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block mb-1 font-medium">Show Name <span className="text-red-500">*</span></label>
            <input type="text" className="w-full border rounded px-3 py-2" value={""} onChange={e => setName(e.target.value)} required />
          </div>
          <div>
            <label className="block mb-1 font-medium">Date <span className="text-red-500">*</span></label>
            <input type="date" className="w-full border rounded px-3 py-2" value={""} onChange={e => setDate(e.target.value)} required />
          </div>
          <div>
            <label className="block mb-1 font-medium">Location <span className="text-red-500">*</span></label>
            <input type="text" className="w-full border rounded px-3 py-2" value={""} onChange={e => setLocation(e.target.value)} required />
          </div>
          <div>
            <label className="block mb-1 font-medium">Class <span className="text-red-500">*</span></label>
            <input type="text" className="w-full border rounded px-3 py-2" value={""} onChange={e => setClassName(e.target.value)} required />
          </div>
          <div>
            <label className="block mb-1 font-medium">Result <span className="text-red-500">*</span></label>
            <input type="text" className="w-full border rounded px-3 py-2" value={""} onChange={e => setResultText(e.target.value)} required />
          </div>
          <div>
            <label className="block mb-1 font-medium">Tags (comma separated)</label>
            <input type="text" className="w-full border rounded px-3 py-2" value={""} onChange={e => setTags(e.target.value.split(',').map(t => t.trim()))} />
          </div>
          <div>
            <label className="block mb-1 font-medium">Status <span className="text-red-500">*</span></label>
            <select className="w-full border rounded px-3 py-2" value={""} onChange={e => setStatus(e.target.value)} required>
              <option value="Completed">Completed</option>
              <option value="Disqualified">Disqualified</option>
              <option value="Withdrawn">Withdrawn</option>
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditExternalResultDialog;
