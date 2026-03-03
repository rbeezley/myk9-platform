import React, { useState, useRef } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import RequiredLabel from '@/components/common/RequiredLabel';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { parseLocalDateString, formatDateLocal } from '@/utils/dateLocal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { POSITION_DISPLAY_NAMES, type PedigreeAncestor } from '@/types/pedigree-types';

interface EditAncestorDialogProps {
  open: boolean;
  ancestor: PedigreeAncestor | null;
  onClose: () => void;
  onSave: (ancestor: PedigreeAncestor) => void;
}

const EditAncestorDialog: React.FC<EditAncestorDialogProps> = ({
  open,
  ancestor,
  onClose,
  onSave,
}) => {
  const [registeredName, setRegisteredName] = useState('');
  const [callName, setCallName] = useState('');
  const [titles, setTitles] = useState('');
  const [breed, setBreed] = useState('');
  const [color, setColor] = useState('');
  const [sex, setSex] = useState<'male' | 'female' | ''>('');
  const [dob, setDob] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [healthInfo, setHealthInfo] = useState('');
  const [regOrg, setRegOrg] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  // Sync form state with ancestor prop
  const ancestorId = ancestor?.id || '';
  const [lastAncestorId, setLastAncestorId] = useState(ancestorId);
  if (ancestorId !== lastAncestorId && ancestor) {
    setLastAncestorId(ancestorId);
    setRegisteredName(ancestor.registered_name);
    setCallName(ancestor.call_name || '');
    setTitles(ancestor.titles || '');
    setBreed(ancestor.breed || '');
    setColor(ancestor.color || '');
    setSex(ancestor.sex || '');
    setDob(ancestor.date_of_birth || '');
    setPhotoUrl(ancestor.photo_url || '');
    setHealthInfo(ancestor.health_info || '');
    const regEntries = Object.entries(ancestor.registration_numbers);
    if (regEntries.length > 0) {
      setRegOrg(regEntries[0][0]);
      setRegNumber(regEntries[0][1]);
    } else {
      setRegOrg('');
      setRegNumber('');
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ancestor) return;

    const registrationNumbers: Record<string, string> = {};
    if (regOrg && regNumber) {
      registrationNumbers[regOrg] = regNumber;
    }

    onSave({
      ...ancestor,
      registered_name: registeredName,
      call_name: callName || null,
      titles: titles || null,
      breed: breed || null,
      color: color || null,
      sex: sex || null,
      date_of_birth: dob || null,
      photo_url: photoUrl || null,
      registration_numbers: registrationNumbers,
      health_info: healthInfo || null,
    });
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() => formRef.current?.requestSubmit()}
      title={ancestor ? `Edit ${POSITION_DISPLAY_NAMES[ancestor.position]}` : 'Edit Ancestor'}
      description={
        <span className="text-xs text-muted-foreground">
          <span className="text-destructive">*</span> Required field. Position cannot be changed.
        </span>
      }
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
          <RequiredLabel required>Registered Name</RequiredLabel>
          <Input
            type="text"
            className="w-full"
            value={registeredName}
            onChange={e => setRegisteredName(e.target.value)}
            required
          />
        </div>
        <div>
          <RequiredLabel>Call Name</RequiredLabel>
          <Input
            type="text"
            className="w-full"
            value={callName}
            onChange={e => setCallName(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div>
          <RequiredLabel>Titles</RequiredLabel>
          <Input
            type="text"
            className="w-full"
            value={titles}
            onChange={e => setTitles(e.target.value)}
            placeholder="e.g. CH, GCH, MACH"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <RequiredLabel>Sex</RequiredLabel>
            <Select value={sex} onValueChange={val => setSex(val as 'male' | 'female' | '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select sex" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <RequiredLabel>DOB</RequiredLabel>
            <DatePicker
              date={dob ? parseLocalDateString(dob) : undefined}
              setDate={date => setDob(date ? formatDateLocal(date) : '')}
              className="dialog-input-bg w-full"
              id="edit-dob"
              name="dob"
              placeholder="YYYY-MM-DD"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <RequiredLabel>Breed</RequiredLabel>
            <Input
              type="text"
              className="w-full"
              value={breed}
              onChange={e => setBreed(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <RequiredLabel>Color</RequiredLabel>
            <Input
              type="text"
              className="w-full"
              value={color}
              onChange={e => setColor(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <RequiredLabel>Registry Org</RequiredLabel>
            <Input
              type="text"
              className="w-full"
              value={regOrg}
              onChange={e => setRegOrg(e.target.value)}
              placeholder="e.g. AKC"
            />
          </div>
          <div>
            <RequiredLabel>Registration #</RequiredLabel>
            <Input
              type="text"
              className="w-full"
              value={regNumber}
              onChange={e => setRegNumber(e.target.value)}
              placeholder="e.g. SS12345"
            />
          </div>
        </div>
        <div>
          <RequiredLabel>Health Info</RequiredLabel>
          <Input
            type="text"
            className="w-full"
            value={healthInfo}
            onChange={e => setHealthInfo(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div>
          <RequiredLabel>Photo URL</RequiredLabel>
          <Input
            type="text"
            className="w-full"
            value={photoUrl}
            onChange={e => setPhotoUrl(e.target.value)}
            placeholder="Optional"
          />
        </div>
      </form>
    </StandardDialog>
  );
};

export default EditAncestorDialog;
