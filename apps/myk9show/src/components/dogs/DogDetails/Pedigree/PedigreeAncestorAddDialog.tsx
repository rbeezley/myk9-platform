import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import RequiredLabel from '@/components/common/RequiredLabel';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Plus } from 'lucide-react';
import { parseLocalDateString, formatDateLocal } from '@/utils/dateLocal';
import { Ancestor } from '@/types/pedigree-types';
import { logger } from '@/services/LoggingService';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface ExtendedAncestor extends Ancestor {
  role: string;
  dob: string;
  photoUrl?: string;
}

interface AddAncestorDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (ancestor: ExtendedAncestor) => void;
}

const AddAncestorDialog: React.FC<AddAncestorDialogProps> = ({ open, onClose, onAdd }) => {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [role, setRole] = useState('');
  const [registration, setRegistration] = useState('');
  const [dob, setDob] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [, setFormErrors] = useState<{ [key: string]: string }>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { [key: string]: string } = {};
    if (!name) errors.name = 'Name is required.';
    if (!title) errors.title = 'Title is required.';
    if (!role) errors.role = 'Role is required.';
    if (!registration) errors.registration = 'Registration is required.';
    if (!dob) errors.dob = 'Date of Birth is required.';
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    onAdd({ id: '', name, title, role, registration, dob, dateOfBirth: dob, imageUrl: photoUrl, photoUrl });
    setName('');
    setTitle('');
    setRole('');
    setRegistration('');
    setDob('');
    setPhotoUrl('');
    onClose();
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() => document.getElementById('add-ancestor-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))}
      title="Add Ancestor"
      description="All fields except photo are required."
      formId="add-ancestor-form"
      saveLabel={<><Plus className="mr-2 h-4 w-4" /> Add</>}
    >
      <form id="add-ancestor-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <RequiredLabel required>Name</RequiredLabel>
          <Input type="text" value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div>
          <RequiredLabel required>Title</RequiredLabel>
          <Input type="text" value={title} onChange={e => setTitle(e.target.value)} required />
        </div>
        <div>
          <RequiredLabel required>Role</RequiredLabel>
          <Select value={role} onValueChange={val => setRole(val)}>
            <SelectTrigger>
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Sire">Sire</SelectItem>
              <SelectItem value="Dam">Dam</SelectItem>
              <SelectItem value="Grandsire">Grandsire</SelectItem>
              <SelectItem value="Granddam">Granddam</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <RequiredLabel required>Registration</RequiredLabel>
          <Input type="text" value={registration} onChange={e => setRegistration(e.target.value)} required />
        </div>
        <div>
  <RequiredLabel required>DOB</RequiredLabel>
  <DatePicker
    date={dob ? parseLocalDateString(dob) : undefined}
    setDate={(date) => setDob(date ? formatDateLocal(date) : '')}
    required
    className="dialog-input-bg"
    id="dob"
    name="dob"
    placeholder="YYYY-MM-DD"
  />
</div>
        <div>
          <RequiredLabel>Photo URL</RequiredLabel>
          <Input type="text" value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} placeholder="Optional" />
        </div>
      </form>
    </StandardDialog>
  );
};

export default AddAncestorDialog;
