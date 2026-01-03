import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import RequiredLabel from '@/components/common/RequiredLabel';
import { Input } from '@/components/ui/input';
import DatePickerField from '@/components/common/DatePickerField';
import { Plus } from 'lucide-react';

export interface TitleProgress {
  id?: number;
  organization: string;
  titleType: string;
  titleLevel: string;
  legNumber?: string;
  points?: string;
  date: string;
}

interface AddTitleProgressDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (progress: TitleProgress) => void;
}

const AddTitleProgressDialog: React.FC<AddTitleProgressDialogProps> = ({ open, onClose, onAdd }) => {
  const [organization, setOrganization] = useState('');
  const [titleType, setTitleType] = useState('');
  const [titleLevel, setTitleLevel] = useState('');
  const [legNumber, setLegNumber] = useState('');
  const [points, setPoints] = useState('');
  const [date, setDate] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !titleType || !titleLevel || !date) return;
    onAdd({ organization, titleType, titleLevel, legNumber, points, date });
    setOrganization('');
    setTitleType('');
    setTitleLevel('');
    setLegNumber('');
    setPoints('');
    setDate('');
    onClose();
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() => document.getElementById('add-title-progress-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))}
      title="Add Title Progress"
      description="* All required fields are marked"
      formId="add-title-progress-form"
      saveLabel={<><Plus className="mr-2 h-4 w-4" /> Add</>}
    >
      <form id="add-title-progress-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <RequiredLabel required>Organization</RequiredLabel>
          <Input type="text" value={""} onChange={e => setOrganization(e.target.value)} required />
        </div>
        <div>
          <RequiredLabel required>Title Type</RequiredLabel>
          <Input type="text" value={""} onChange={e => setTitleType(e.target.value)} required />
        </div>
        <div>
          <RequiredLabel required>Title Level</RequiredLabel>
          <Input type="text" value={""} onChange={e => setTitleLevel(e.target.value)} required />
        </div>
        <div>
          <RequiredLabel>Leg Number</RequiredLabel>
          <Input type="text" value={""} onChange={e => setLegNumber(e.target.value)} />
        </div>
        <div>
          <RequiredLabel>Points</RequiredLabel>
          <Input type="text" value={""} onChange={e => setPoints(e.target.value)} />
        </div>
        <div>
          <RequiredLabel required>Date</RequiredLabel>
          <DatePickerField
            label="Date"
            value={""}
            onChange={setDate}
            required
          />
        </div>
      </form>
    </StandardDialog>
  );
};

export default AddTitleProgressDialog;
