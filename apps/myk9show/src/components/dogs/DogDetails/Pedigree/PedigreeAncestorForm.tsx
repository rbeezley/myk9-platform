import React, { useState, useImperativeHandle, forwardRef } from 'react';
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

export interface AncestorFormValues {
  registeredName: string;
  callName: string;
  titles: string;
  breed: string;
  color: string;
  sex: 'male' | 'female' | '';
  dob: string;
  photoUrl: string;
  healthInfo: string;
  regOrg: string;
  regNumber: string;
}

const INITIAL_VALUES: AncestorFormValues = {
  registeredName: '',
  callName: '',
  titles: '',
  breed: '',
  color: '',
  sex: '',
  dob: '',
  photoUrl: '',
  healthInfo: '',
  regOrg: '',
  regNumber: '',
};

export interface PedigreeAncestorFormRef {
  reset: () => void;
}

interface PedigreeAncestorFormProps {
  formId: string;
  initialValues?: Partial<AncestorFormValues> | undefined;
  onSubmit: (values: AncestorFormValues) => void;
}

const PedigreeAncestorForm = forwardRef<PedigreeAncestorFormRef, PedigreeAncestorFormProps>(
  ({ formId, initialValues, onSubmit }, ref) => {
    const [form, setForm] = useState<AncestorFormValues>({
      ...INITIAL_VALUES,
      ...initialValues,
    });

    useImperativeHandle(ref, () => ({
      reset: () => setForm({ ...INITIAL_VALUES, ...initialValues }),
    }));

    const update = (field: keyof AncestorFormValues, value: string) =>
      setForm(prev => ({ ...prev, [field]: value }));

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      onSubmit(form);
    };

    return (
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <RequiredLabel required>Registered Name</RequiredLabel>
          <Input
            type="text"
            value={form.registeredName}
            onChange={e => update('registeredName', e.target.value)}
            required
          />
        </div>
        <div>
          <RequiredLabel>Call Name</RequiredLabel>
          <Input
            type="text"
            value={form.callName}
            onChange={e => update('callName', e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div>
          <RequiredLabel>Titles</RequiredLabel>
          <Input
            type="text"
            value={form.titles}
            onChange={e => update('titles', e.target.value)}
            placeholder="e.g. CH, GCH, MACH"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <RequiredLabel>Sex</RequiredLabel>
            <Select
              value={form.sex}
              onValueChange={val => {
                if (val === 'male' || val === 'female') update('sex', val);
              }}
            >
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
              date={form.dob ? parseLocalDateString(form.dob) : undefined}
              setDate={date => update('dob', date ? formatDateLocal(date) : '')}
              className="dialog-input-bg"
              id={`${formId}-dob`}
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
              value={form.breed}
              onChange={e => update('breed', e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <RequiredLabel>Color</RequiredLabel>
            <Input
              type="text"
              value={form.color}
              onChange={e => update('color', e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <RequiredLabel>Registry Org</RequiredLabel>
            <Input
              type="text"
              value={form.regOrg}
              onChange={e => update('regOrg', e.target.value)}
              placeholder="e.g. AKC, UKC"
            />
          </div>
          <div>
            <RequiredLabel>Registration #</RequiredLabel>
            <Input
              type="text"
              value={form.regNumber}
              onChange={e => update('regNumber', e.target.value)}
              placeholder="e.g. SS12345"
            />
          </div>
        </div>
        <div>
          <RequiredLabel>Health Info</RequiredLabel>
          <Input
            type="text"
            value={form.healthInfo}
            onChange={e => update('healthInfo', e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div>
          <RequiredLabel>Photo URL</RequiredLabel>
          <Input
            type="text"
            value={form.photoUrl}
            onChange={e => update('photoUrl', e.target.value)}
            placeholder="Optional"
          />
        </div>
      </form>
    );
  }
);

PedigreeAncestorForm.displayName = 'PedigreeAncestorForm';

export default PedigreeAncestorForm;
