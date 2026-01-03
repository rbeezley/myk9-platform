import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import RequiredLabel from '@/components/common/RequiredLabel';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus } from 'lucide-react';

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

interface AddExternalResultDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (result: ExternalResult) => void;
}

const AddExternalResultDialog: React.FC<AddExternalResultDialogProps> = ({ open, onClose, onAdd }) => {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [className, setClassName] = useState('');
  const [result, setResult] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [status, setStatus] = useState('Completed');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !date || !location || !className || !result || !status) return;
    onAdd({ name, date, location, className, result, tags, status });
    setName('');
    setDate('');
    setLocation('');
    setClassName('');
    setResult('');
    setTags([]);
    setStatus('Completed');
    onClose();
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() => document.getElementById('add-external-result-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))}
      title="Add External Result"
      description="All fields except Tags are required."
      formId="add-external-result-form"
      saveLabel={<><Plus className="mr-2 h-4 w-4" /> Add</>}
    >
      <form id="add-external-result-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <RequiredLabel required>Show Name</RequiredLabel>
          <Input type="text" value={""} onChange={e => setName(e.target.value)} required />
        </div>
        <div>
          <RequiredLabel required>Date</RequiredLabel>
          <Input type="date" value={""} onChange={e => setDate(e.target.value)} required />
        </div>
        <div>
          <RequiredLabel required>Location</RequiredLabel>
          <Input type="text" value={""} onChange={e => setLocation(e.target.value)} required />
        </div>
        <div>
          <RequiredLabel required>Class</RequiredLabel>
          <Input type="text" value={""} onChange={e => setClassName(e.target.value)} required />
        </div>
        <div>
          <RequiredLabel required>Result</RequiredLabel>
          <Input type="text" value={""} onChange={e => setResult(e.target.value)} required />
        </div>
        <div>
          <RequiredLabel>Tags (comma separated)</RequiredLabel>
          <Input type="text" value={""} onChange={e => setTags(e.target.value.split(',').map(t => t.trim()))} />
        </div>
        <div>
          <RequiredLabel required>Status</RequiredLabel>
          <Select value={""} onValueChange={val => setStatus(val)}>
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Completed">Completed</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Disqualified">Disqualified</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </form>
    </StandardDialog>
  );
};

export default AddExternalResultDialog;
