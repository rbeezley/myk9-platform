import React, { useState, useEffect } from 'react';
import type { Dog, Owner } from '@/types/dog-types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import DatePickerField from '@/components/common/DatePickerField';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface DogProfileEditDialogProps {
  open: boolean;
  dog: Dog | null;
  onClose: () => void;
  onSave: (updatedDog: Dog) => void;
  owners?: Owner[]; // Optional, for owner selection if needed
}

const genderOptions = ['Male', 'Female'];
const spayNeuterOptions = [
  { label: 'Yes', value: true },
  { label: 'No', value: false },
];

export const DogProfileEditDialog: React.FC<DogProfileEditDialogProps> = ({ open, dog, onClose, onSave, owners }) => {
  // Helper to create a blank Dog object
  const blankDog = React.useMemo<Dog>(() => ({
    id: '',
    callName: '',
    name: '',
    breed: '', // Required field
    sex: 'male', // Required field
    age: 0,
    description: '',
    gender: '',
    dateOfBirth: '',
    height: '',
    weight: '',
    color: '',
    spayedNeutered: undefined,
    ownerId: '',
    registrations: [],
    // Add any other required fields with default values
  }), []);

  const [form, setForm] = useState<Dog | null>(dog ?? blankDog);
  const [touched, setTouched] = useState<{ [K in keyof Dog]?: boolean }>({});

  useEffect(() => {
    setForm(dog ?? blankDog);
    setTouched({});
  }, [dog, open, blankDog]);

  if (!open || !form) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let val: string | number | boolean | undefined = value;
    if (type === 'number') val = value === '' ? '' : Number(value);
    if (name === 'spayedNeutered') val = value === 'true';
    setForm(f => f ? { ...f, [name]: val } : f);
    setTouched(t => ({ ...t, [name]: true }));
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name } = e.target;
    setTouched(t => ({ ...t, [name]: true }));
  };

  const isValid = () => {
    // Breed is no longer required on the dog profile
    return !!form.callName?.trim() && !!form.gender && !!form.dateOfBirth && form.spayedNeutered !== undefined;
  };

  const handleSave = () => {
    if (isValid()) {
      onSave(form);
    } else {
      setTouched({ callName: true, gender: true, dateOfBirth: true, spayedNeutered: true });
    }
  };

  const showErrors = (field: keyof Dog) => {
    if (!touched[field]) return false;

    // Special handling for boolean fields
    if (field === 'spayedNeutered') {
      return form[field] === undefined;
    }

    // For other fields
    return !form[field] || (typeof form[field] === 'string' && !String(form[field]).trim());
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{(!dog || !dog.id) ? 'Add Dog' : 'Edit Dog Profile'}</DialogTitle>
          <DialogDescription>
            {(!dog || !dog.id) ? 'Add a new dog to your list.' : "Update your dog's profile information."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {/* Call Name - Full Width */}
          <div className="space-y-2">
            <Label>Call Name <span className="text-destructive">*</span></Label>
            <Input
              name="callName"
              value={form.callName || ''}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="Enter dog's call name"
              className="form-input h-10"
            />
            {showErrors('callName') && (
              <p className="text-sm text-destructive">Call Name is required.</p>
            )}
          </div>

          {/* Primary Owner - Full Width (if owners provided) */}
          {owners && (
            <div className="space-y-2">
              <Label>Primary Owner</Label>
              <Select
                value={form.ownerId || ''}
                onValueChange={val => handleChange({ target: { name: 'ownerId', value: val, type: 'select-one' } } as React.ChangeEvent<HTMLSelectElement>)}
              >
                <SelectTrigger className="form-input h-10">
                  <SelectValue placeholder="Select owner" />
                </SelectTrigger>
                <SelectContent>
                  {owners.map(owner => (
                    <SelectItem key={owner.id} value={owner.id}>{owner.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Date of Birth and Gender - Two Columns */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date of Birth <span className="text-destructive">*</span></Label>
              <div className="w-full">
                <DatePickerField
                  label=""
                  value={form.dateOfBirth || ''}
                  onChange={d => setForm(f => f ? { ...f, dateOfBirth: d } : f)}
                  required={false}
                  className="w-full text-sm h-10"
                />
              </div>
              {showErrors('dateOfBirth') && (
                <p className="text-sm text-destructive">Date of Birth is required.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Gender <span className="text-destructive">*</span></Label>
              <Select
                name="gender"
                value={form.gender || ''}
                onValueChange={val => handleChange({ target: { name: 'gender', value: val, type: 'select-one' } } as React.ChangeEvent<HTMLSelectElement>)}
              >
                <SelectTrigger className="form-input h-10">
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  {genderOptions.map(opt => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {showErrors('gender') && (
                <p className="text-sm text-destructive">Gender is required.</p>
              )}
            </div>
          </div>

          {/* Height, Weight, and Color - Three Column Grid */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Height</Label>
              <Input
                name="height"
                value={form.height || ''}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="e.g., 24 inches"
                className="form-input h-10"
              />
            </div>
            <div className="space-y-2">
              <Label>Weight</Label>
              <Input
                name="weight"
                value={form.weight || ''}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="e.g., 65 lbs"
                className="form-input h-10"
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <Input
                name="color"
                value={form.color || ''}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="e.g., Black and Tan"
                className="form-input h-10"
              />
            </div>
          </div>

          {/* Spayed/Neutered - Full Width */}
          <div className="space-y-2">
            <Label>Spayed/Neutered <span className="text-destructive">*</span></Label>
            <Select
              value={form.spayedNeutered === undefined ? '' : form.spayedNeutered.toString()}
              onValueChange={val => handleChange({ target: { name: 'spayedNeutered', value: val, type: 'select-one' } } as React.ChangeEvent<HTMLSelectElement>)}
            >
              <SelectTrigger className="form-input h-10">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {spayNeuterOptions.map(opt => (
                  <SelectItem key={opt.value ? 'yes' : 'no'} value={opt.value.toString()}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {showErrors('spayedNeutered') && (
              <p className="text-sm text-destructive">This field is required.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid()}>
            {(!dog || !dog.id) ? 'Add Dog' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
