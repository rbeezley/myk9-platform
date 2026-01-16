import React, { useState, useRef } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import RequiredLabel from '@/components/common/RequiredLabel';
import type { ExtendedAncestor } from './PedigreeAncestorAddDialog';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { parseLocalDateString, formatDateLocal } from '@/utils/dateLocal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface EditAncestorDialogProps {
  open: boolean;
  ancestor: ExtendedAncestor | null;
  onClose: () => void;
  onSave: (ancestor: ExtendedAncestor) => void;
}

const EditAncestorDialog: React.FC<EditAncestorDialogProps> = ({ open, ancestor, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [role, setRole] = useState('');
  const [registration, setRegistration] = useState('');
  const [dob, setDob] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  // Sync form state with ancestor prop - using render-time state update pattern
  const ancestorId = ancestor?.id || '';
  const [lastAncestorId, setLastAncestorId] = useState(ancestorId);
  if (ancestorId !== lastAncestorId && ancestor) {
    setLastAncestorId(ancestorId);
    setName(ancestor.name);
    setTitle(ancestor.title || '');
    setRole(ancestor.role);
    setRegistration(ancestor.registration || '');
    setDob(ancestor.dob);
    setPhotoUrl(ancestor.photoUrl || '');
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ancestor) return;
    onSave({ ...ancestor, name, title, role, registration, dob, photoUrl });
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() => {
        if (formRef.current) formRef.current.requestSubmit();
      }}
      title="Edit Ancestor"
      description={<span className="text-xs text-muted-foreground"><span className="text-destructive">*</span> All fields except photo are required</span>}
      saveLabel="Save"
      cancelLabel="Cancel"
      formId="edit-ancestor-form"
    >
      <form
        ref={formRef}
        id="edit-ancestor-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        <div>
          <RequiredLabel required>Name</RequiredLabel>
          <Input type="text" className="w-full" value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div>
          <RequiredLabel required>Title</RequiredLabel>
          <Input type="text" className="w-full" value={title} onChange={e => setTitle(e.target.value)} required />
        </div>
        <div>
          <RequiredLabel required>Role</RequiredLabel>
          <Select value={role} onValueChange={setRole} required>
            <SelectTrigger className="w-full">
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
          <Input type="text" className="w-full" value={registration} onChange={e => setRegistration(e.target.value)} required />
        </div>
        <div>
  <RequiredLabel required>DOB</RequiredLabel>
  <DatePicker
    date={dob ? parseLocalDateString(dob) : undefined}
    setDate={(date) => setDob(date ? formatDateLocal(date) : '')}
    required
    className="dialog-input-bg w-full"
    id="dob"
    name="dob"
    placeholder="YYYY-MM-DD"
  />
</div>
        <div>
          <RequiredLabel>Photo URL</RequiredLabel>
          <Input type="text" className="w-full" value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} placeholder="Optional" />
        </div>
      </form>
    </StandardDialog>
  );
};

export default EditAncestorDialog;
