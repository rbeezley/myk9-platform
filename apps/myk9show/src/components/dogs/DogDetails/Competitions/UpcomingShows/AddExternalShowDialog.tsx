import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { FormField } from '@/components/common/FormField';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';

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
  return !!comp.name.trim() && !!comp.date && !!comp.location.trim() && !!comp.status.trim();
};

const blankCompetition: Competition = {
  id: '',
  name: '',
  date: '',
  location: '',
  status: 'Upcoming',
  dogId: '',
};

const AddExternalShowDialog: React.FC<AddExternalShowDialogProps> = ({
  show,
  mode,
  open,
  onClose,
  onSave,
}) => {
  const isAddMode = open && (!show || mode === 'add');
  const [form, setForm] = useState<Competition>(
    isAddMode ? blankCompetition : show || blankCompetition
  );
  const [touched, setTouched] = useState<{ [K in keyof Competition]?: boolean }>({});

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
  const getFieldError = (field: keyof Competition): string | undefined => {
    if (!touched[field]) return undefined;
    switch (field) {
      case 'name':
        return !form.name.trim() ? 'Please enter a competition name.' : undefined;
      case 'date':
        return !form.date ? 'Please select a date.' : undefined;
      case 'location':
        return !form.location.trim() ? 'Please enter a location.' : undefined;
      case 'status':
        return !form.status.trim() ? 'Please select a status.' : undefined;
      default:
        return undefined;
    }
  };

  if (!form) return null;

  const nameError = getFieldError('name');
  const dateError = getFieldError('date');
  const locationError = getFieldError('location');
  const statusError = getFieldError('status');

  return (
    <StandardDialog
      open={open}
      title={isAddMode ? 'Add Competition' : 'Edit Competition'}
      description={isAddMode ? 'Add a new competition.' : 'Update competition information.'}
      onClose={onClose}
      formId="competition-edit-form"
      onSave={() =>
        document
          .getElementById('competition-edit-form')
          ?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
      }
    >
      <form id="competition-edit-form" onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
        <FormField
          label="Competition Name"
          fieldId="competitionName"
          required
          error={nameError}
        >
          <Input
            id="competitionName"
            name="name"
            value={''}
            onChange={handleChange}
            onBlur={handleBlur}
            required
            aria-invalid={!!nameError}
            aria-describedby={nameError ? 'competitionName-error' : undefined}
            className={nameError ? 'border-destructive focus-visible:ring-destructive' : ''}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Date" fieldId="competitionDate" required error={dateError}>
            <Input
              id="competitionDate"
              name="date"
              type="date"
              value={''}
              onChange={handleChange}
              onBlur={handleBlur}
              required
              aria-invalid={!!dateError}
              aria-describedby={dateError ? 'competitionDate-error' : undefined}
              className={dateError ? 'border-destructive focus-visible:ring-destructive' : ''}
            />
          </FormField>
          <FormField
            label="Location"
            fieldId="competitionLocation"
            required
            error={locationError}
          >
            <Input
              id="competitionLocation"
              name="location"
              value={''}
              onChange={handleChange}
              onBlur={handleBlur}
              required
              aria-invalid={!!locationError}
              aria-describedby={locationError ? 'competitionLocation-error' : undefined}
              className={locationError ? 'border-destructive focus-visible:ring-destructive' : ''}
            />
          </FormField>
        </div>
        <FormField
          label="Status"
          fieldId="competitionStatus"
          required
          error={statusError}
        >
          <Select
            value={''}
            onValueChange={value => {
              setForm({ ...form, status: value as Competition['status'] });
              setTouched({ ...touched, status: true });
            }}
            required
          >
            <SelectTrigger
              aria-invalid={!!statusError}
              aria-describedby={statusError ? 'competitionStatus-error' : undefined}
              className={statusError ? 'border-destructive focus-visible:ring-destructive' : ''}
            >
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map(opt => (
                <SelectItem key={opt} value={''}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Dog ID" fieldId="dogId">
          <Input id="dogId" name="dogId" value={''} onChange={handleChange} onBlur={handleBlur} />
        </FormField>
      </form>
    </StandardDialog>
  );
};

export default AddExternalShowDialog;
