import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import RequiredLabel from '@/components/common/RequiredLabel';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Plus } from 'lucide-react';
import { parseLocalDateString, formatDateLocal } from '@/utils/dateLocal';
import {
  POSITION_DISPLAY_NAMES,
  type PedigreePosition,
  type CreatePedigreeAncestorData,
} from '@/types/pedigree-types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface PedigreeAncestorAddDialogProps {
  open: boolean;
  position: PedigreePosition | null;
  dogId: string;
  ownerId: string;
  onClose: () => void;
  onAdd: (data: CreatePedigreeAncestorData) => void;
}

const PedigreeAncestorAddDialog: React.FC<PedigreeAncestorAddDialogProps> = ({
  open,
  position,
  dogId,
  ownerId,
  onClose,
  onAdd,
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
  // Multi-org registration: one row for now, editable as org + number
  const [regOrg, setRegOrg] = useState('');
  const [regNumber, setRegNumber] = useState('');

  const resetForm = () => {
    setRegisteredName('');
    setCallName('');
    setTitles('');
    setBreed('');
    setColor('');
    setSex('');
    setDob('');
    setPhotoUrl('');
    setHealthInfo('');
    setRegOrg('');
    setRegNumber('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!position) return;

    const registrationNumbers: Record<string, string> = {};
    if (regOrg && regNumber) {
      registrationNumbers[regOrg] = regNumber;
    }

    onAdd({
      dog_id: dogId,
      owner_id: ownerId,
      position,
      linked_dog_id: null,
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
    resetForm();
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <StandardDialog
      open={open}
      onClose={handleClose}
      onSave={() =>
        document
          .getElementById('add-ancestor-form')
          ?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
      }
      title={position ? `Add ${POSITION_DISPLAY_NAMES[position]}` : 'Add Ancestor'}
      description="Required fields are marked with *. Other fields are optional."
      formId="add-ancestor-form"
      saveLabel={
        <>
          <Plus className="mr-2 h-4 w-4" /> Add
        </>
      }
    >
      <form id="add-ancestor-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <RequiredLabel required>Registered Name</RequiredLabel>
          <Input
            type="text"
            value={registeredName}
            onChange={e => setRegisteredName(e.target.value)}
            required
          />
        </div>
        <div>
          <RequiredLabel>Call Name</RequiredLabel>
          <Input
            type="text"
            value={callName}
            onChange={e => setCallName(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div>
          <RequiredLabel>Titles</RequiredLabel>
          <Input
            type="text"
            value={titles}
            onChange={e => setTitles(e.target.value)}
            placeholder="e.g. CH, GCH, MACH"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <RequiredLabel>Sex</RequiredLabel>
            <Select value={sex} onValueChange={val => setSex(val as 'male' | 'female' | '')}>
              <SelectTrigger>
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
              className="dialog-input-bg"
              id="dob"
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
              value={breed}
              onChange={e => setBreed(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <RequiredLabel>Color</RequiredLabel>
            <Input
              type="text"
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
              value={regOrg}
              onChange={e => setRegOrg(e.target.value)}
              placeholder="e.g. AKC, UKC"
            />
          </div>
          <div>
            <RequiredLabel>Registration #</RequiredLabel>
            <Input
              type="text"
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
            value={healthInfo}
            onChange={e => setHealthInfo(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div>
          <RequiredLabel>Photo URL</RequiredLabel>
          <Input
            type="text"
            value={photoUrl}
            onChange={e => setPhotoUrl(e.target.value)}
            placeholder="Optional"
          />
        </div>
      </form>
    </StandardDialog>
  );
};

export default PedigreeAncestorAddDialog;
