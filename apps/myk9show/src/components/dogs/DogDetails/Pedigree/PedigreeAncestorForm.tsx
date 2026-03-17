import React, { useState, useImperativeHandle, forwardRef } from 'react';
import { FormField } from '@/components/common/FormField';
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
        <FormField label="Registered Name" fieldId={`${formId}-registeredName`} required>
          <Input
            id={`${formId}-registeredName`}
            type="text"
            value={form.registeredName}
            onChange={e => update('registeredName', e.target.value)}
            required
          />
        </FormField>
        <FormField label="Call Name" fieldId={`${formId}-callName`}>
          <Input
            id={`${formId}-callName`}
            type="text"
            value={form.callName}
            onChange={e => update('callName', e.target.value)}
            placeholder="Optional"
          />
        </FormField>
        <FormField label="Titles" fieldId={`${formId}-titles`}>
          <Input
            id={`${formId}-titles`}
            type="text"
            value={form.titles}
            onChange={e => update('titles', e.target.value)}
            placeholder="e.g. CH, GCH, MACH"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Sex" fieldId={`${formId}-sex`}>
            <Select
              value={form.sex}
              onValueChange={val => {
                if (val === 'male' || val === 'female') update('sex', val);
              }}
            >
              <SelectTrigger id={`${formId}-sex`}>
                <SelectValue placeholder="Select sex" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="DOB" fieldId={`${formId}-dob`}>
            <DatePicker
              date={form.dob ? parseLocalDateString(form.dob) : undefined}
              setDate={date => update('dob', date ? formatDateLocal(date) : '')}
              className="dialog-input-bg"
              id={`${formId}-dob`}
              name="dob"
              placeholder="YYYY-MM-DD"
            />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Breed" fieldId={`${formId}-breed`}>
            <Input
              id={`${formId}-breed`}
              type="text"
              value={form.breed}
              onChange={e => update('breed', e.target.value)}
              placeholder="Optional"
            />
          </FormField>
          <FormField label="Color" fieldId={`${formId}-color`}>
            <Input
              id={`${formId}-color`}
              type="text"
              value={form.color}
              onChange={e => update('color', e.target.value)}
              placeholder="Optional"
            />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Registry Org" fieldId={`${formId}-regOrg`}>
            <Input
              id={`${formId}-regOrg`}
              type="text"
              value={form.regOrg}
              onChange={e => update('regOrg', e.target.value)}
              placeholder="e.g. AKC, UKC"
            />
          </FormField>
          <FormField label="Registration #" fieldId={`${formId}-regNumber`}>
            <Input
              id={`${formId}-regNumber`}
              type="text"
              value={form.regNumber}
              onChange={e => update('regNumber', e.target.value)}
              placeholder="e.g. SS12345"
            />
          </FormField>
        </div>
        <FormField label="Health Info" fieldId={`${formId}-healthInfo`}>
          <Input
            id={`${formId}-healthInfo`}
            type="text"
            value={form.healthInfo}
            onChange={e => update('healthInfo', e.target.value)}
            placeholder="Optional"
          />
        </FormField>
        <FormField label="Photo URL" fieldId={`${formId}-photoUrl`}>
          <Input
            id={`${formId}-photoUrl`}
            type="text"
            value={form.photoUrl}
            onChange={e => update('photoUrl', e.target.value)}
            placeholder="Optional"
          />
        </FormField>
      </form>
    );
  }
);

PedigreeAncestorForm.displayName = 'PedigreeAncestorForm';

export default PedigreeAncestorForm;
