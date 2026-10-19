import React, { useState, useImperativeHandle, forwardRef } from 'react';
import { FormField } from '@/components/common/FormField';
import { Input } from '@/components/ui/input';
import { FieldError, fieldErrorControlProps, useSubmitFieldErrors } from '@/components/forms';
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
  hideSex?: boolean;
  onSubmit: (values: AncestorFormValues) => void;
}

const PedigreeAncestorForm = forwardRef<PedigreeAncestorFormRef, PedigreeAncestorFormProps>(
  ({ formId, initialValues, hideSex = false, onSubmit }, ref) => {
    const [form, setForm] = useState<AncestorFormValues>({
      ...INITIAL_VALUES,
      ...initialValues,
    });
    const regOrgId = `${formId}-regOrg`;
    const regNumberId = `${formId}-regNumber`;
    const nameId = `${formId}-registeredName`;
    // Registry Org and Registration # are only persisted as a pair (see
    // PedigreeAncestorAddDialog/EditDialog, which build
    // `registration_numbers` only when both are present). A half-filled
    // pair passes native validation but is silently discarded on save,
    // so the empty half is flagged instead.
    const errors: Record<string, string> = {};
    if (!form.registeredName.trim()) errors[nameId] = 'Enter the registered name.';
    const hasRegOrg = form.regOrg.trim() !== '';
    const hasRegNumber = form.regNumber.trim() !== '';
    if (hasRegOrg && !hasRegNumber) {
      errors[regNumberId] = 'Enter the registration number, or clear the registry organization.';
    } else if (hasRegNumber && !hasRegOrg) {
      errors[regOrgId] = 'Enter the registry organization, or clear the registration number.';
    }
    const { shown, fail } = useSubmitFieldErrors(errors);

    useImperativeHandle(ref, () => ({
      reset: () => {
        setForm({ ...INITIAL_VALUES, ...initialValues });
      },
    }));

    const update = (field: keyof AncestorFormValues, value: string) =>
      setForm(prev => ({ ...prev, [field]: value }));

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (fail()) return;
      onSubmit(form);
    };

    return (
      <form id={formId} noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Registered Name" fieldId={nameId} required>
          <Input
            id={nameId}
            type="text"
            value={form.registeredName}
            onChange={e => update('registeredName', e.target.value)}
            required
            {...fieldErrorControlProps(nameId, shown[nameId])}
          />
          <FieldError field={nameId} message={shown[nameId]} />
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
          {!hideSex && (
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
          )}
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
              id={regOrgId}
              type="text"
              value={form.regOrg}
              onChange={e => update('regOrg', e.target.value)}
              placeholder="e.g. AKC, UKC"
              {...fieldErrorControlProps(regOrgId, shown[regOrgId])}
            />
            <FieldError field={regOrgId} message={shown[regOrgId]} />
          </FormField>
          <FormField label="Registration #" fieldId={`${formId}-regNumber`}>
            <Input
              id={regNumberId}
              type="text"
              value={form.regNumber}
              onChange={e => update('regNumber', e.target.value)}
              placeholder="e.g. SS12345"
              {...fieldErrorControlProps(regNumberId, shown[regNumberId])}
            />
            <FieldError field={regNumberId} message={shown[regNumberId]} />
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
