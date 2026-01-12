import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { Input } from '@/components/ui/input';
import { logger } from '@/services/LoggingService';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue
} from '@/components/ui/select';


import RequiredLabel from '@/components/common/RequiredLabel';
import type { Competition } from '@/types/competition-types';
import { toYYYYMMDD } from '@/utils/dateFormat';

interface AddExternalShowDialogProps {
  show: Competition | null;
  mode: 'edit' | 'add';
  open: boolean;
  onClose: () => void;
  onSave?: (competition: Competition) => void;
}

const statusOptions: Competition['status'][] = ['Upcoming', 'Cancelled', 'Completed'];

const isCompetitionValid = (comp: Competition) => {
  return (
    !!comp.name.trim() &&
    !!comp.date &&
    !!comp.location.trim() &&
    !!comp.status.trim()
  );
};

const blankCompetition: Competition = {
  id: '',
  name: '',
  date: '',
  location: '',
  status: 'Upcoming',
  dogId: '',
};

const AddExternalShowDialog: React.FC<AddExternalShowDialogProps> = ({ show, mode, open, onClose, onSave }) => {
  const isAddMode = open && (!show || mode === 'add');
  const [form, setForm] = useState<Competition>(isAddMode ? blankCompetition : (show || blankCompetition));
  const [touched, setTouched] = useState<{[K in keyof Competition]?: boolean}>({});

  React.useEffect(() => {
    if (isAddMode) {
      setForm(blankCompetition);
    } else if (show) {
      setForm({
        ...show,
        date: toYYYYMMDD(show.date),
      });
    }
  }, [show, open, isAddMode]);

  if (!open) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
    setTouched({ ...touched, [name]: true });
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name } = e.target;
    setTouched({ ...touched, [name]: true });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSave && isCompetitionValid(form)) {
      onSave(form);
      onClose();
    } else {
      // Mark all fields as touched to trigger error display
      setTouched({
        id: true,
        name: true,
        date: true,
        location: true,
        status: true,
        dogId: true,
      });
    }
  };

  // Validation helpers
  const showErrors = (field: keyof Competition) => {
    if (!touched[field]) return false;
    switch (field) {
      case 'name': return !form.name.trim();
      case 'date': return !form.date;
      case 'location': return !form.location.trim();
      case 'status': return !form.status.trim();
      default: return false;
    }
  };

  if (!form) return null;

  return (
    <StandardDialog
      open={open}
      title={isAddMode ? 'Add Competition' : 'Edit Competition'}
      description={isAddMode ? 'Add a new competition.' : 'Update competition information.'}
      onClose={onClose}
      formId="competition-edit-form"
      onSave={() => document.getElementById('competition-edit-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))}
    >
      <form id="competition-edit-form" onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1"><RequiredLabel required>Competition Name</RequiredLabel></label>
          <Input
            name="name"
            value={""}
            onChange={handleChange}
            onBlur={handleBlur}
            required
            className={showErrors('name') ? 'border-red-500 focus:ring-red-300' : ''}
          />
          {showErrors('name') && <div className="text-xs text-red-500 mt-1">Name is required.</div>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1"><RequiredLabel required>Date</RequiredLabel></label>
            <Input
              name="date"
              type="date"
              value={""}
              onChange={handleChange}
              onBlur={handleBlur}
              required
              className={showErrors('date') ? 'border-red-500 focus:ring-red-300' : ''}
            />
            {showErrors('date') && <div className="text-xs text-red-500 mt-1">Date is required.</div>}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1"><RequiredLabel required>Location</RequiredLabel></label>
            <Input
              name="location"
              value={""}
              onChange={handleChange}
              onBlur={handleBlur}
              required
              className={showErrors('location') ? 'border-red-500 focus:ring-red-300' : ''}
            />
            {showErrors('location') && <div className="text-xs text-red-500 mt-1">Location is required.</div>}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1"><RequiredLabel required>Status</RequiredLabel></label>
          <Select
            value={""}
            onValueChange={value => {
              setForm({ ...form, status: value as Competition['status'] });
              setTouched({ ...touched, status: true });
            }}
            required
          >
            <SelectTrigger className={showErrors('status') ? 'border-red-500 focus:ring-red-300' : ''}>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map(opt => (
                <SelectItem key={opt} value={""}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {showErrors('status') && <div className="text-xs text-red-500 mt-1">Status is required.</div>}
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Dog ID</label>
          <Input
            name="dogId"
            value={""}
            onChange={handleChange}
            onBlur={handleBlur}
            className={showErrors('dogId') ? 'border-red-500 focus:ring-red-300' : ''}
          />
        </div>
      </form>
    </StandardDialog>
  );
};

export default AddExternalShowDialog;