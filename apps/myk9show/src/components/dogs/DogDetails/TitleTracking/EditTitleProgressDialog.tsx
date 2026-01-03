import React, { useState, useEffect } from 'react';
import { DatePicker } from '@/components/ui/date-picker';
import StandardDialog from '@/components/common/StandardDialog';
import RequiredLabel from '@/components/common/RequiredLabel';
import type { TitleProgress } from './AddTitleProgressDialog';
import { parseLocalDateString, formatDateLocal } from '@/utils/dateLocal';

interface EditTitleProgressDialogProps {
  open: boolean;
  progress: TitleProgress | null;
  onClose: () => void;
  onSave: (progress: TitleProgress) => void;
}

const EditTitleProgressDialog: React.FC<EditTitleProgressDialogProps> = ({ open, progress, onClose, onSave }) => {
  const [organization, setOrganization] = useState('');
  const [titleType, setTitleType] = useState('');
  const [titleLevel, setTitleLevel] = useState('');
  const [legNumber, setLegNumber] = useState('');
  const [points, setPoints] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    if (progress) {
      setOrganization(progress.organization || '');
      setTitleType(progress.titleType || '');
      setTitleLevel(progress.titleLevel || '');
      setLegNumber(progress.legNumber || '');
      setPoints(progress.points || '');
      setDate(progress.date || '');
    }
  }, [progress]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!progress) return;
    onSave({ ...progress, organization, titleType, titleLevel, legNumber, points, date });
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() => document.getElementById('edit-title-progress-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))}
      title="Edit Title Progress"
      description={<span className="text-xs text-muted-foreground"><span className="text-red-500">*</span> All required fields are marked</span>}
      formId="edit-title-progress-form"
      saveLabel="Save"
    >
      <form id="edit-title-progress-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block mb-1 font-medium">
            <RequiredLabel required>Organization</RequiredLabel>
          </label>
          <input type="text" className="w-full border rounded px-3 py-2" value={organization} onChange={e => setOrganization(e.target.value)} required />
        </div>
        <div>
          <label className="block mb-1 font-medium">
            <RequiredLabel required>Title Type</RequiredLabel>
          </label>
          <input type="text" className="w-full border rounded px-3 py-2" value={titleType} onChange={e => setTitleType(e.target.value)} required />
        </div>
        <div>
          <label className="block mb-1 font-medium">
            <RequiredLabel required>Title Level</RequiredLabel>
          </label>
          <input type="text" className="w-full border rounded px-3 py-2" value={titleLevel} onChange={e => setTitleLevel(e.target.value)} required />
        </div>
        <div>
          <label className="block mb-1 font-medium">
            <RequiredLabel>Leg Number</RequiredLabel>
          </label>
          <input type="text" className="w-full border rounded px-3 py-2" value={legNumber} onChange={e => setLegNumber(e.target.value)} />
        </div>
        <div>
          <label className="block mb-1 font-medium">
            <RequiredLabel>Points</RequiredLabel>
          </label>
          <input type="text" className="w-full border rounded px-3 py-2" value={points} onChange={e => setPoints(e.target.value)} />
        </div>
        <div>
          <RequiredLabel required>Date</RequiredLabel>
          <DatePicker
            date={date ? parseLocalDateString(date) : undefined}
            setDate={(newDate) => setDate(newDate ? formatDateLocal(newDate) : '')}
            required
            className="dialog-input-bg w-full"
            id="titleProgressDate"
            name="date"
            placeholder="YYYY-MM-DD"
          />
        </div>
      </form>
    </StandardDialog>
  );
};

export default EditTitleProgressDialog;
