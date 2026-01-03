import React, { useState, useEffect } from 'react';
import { AppleDialog, AppleFormField, AppleFormGrid } from '@/components/ui/AppleDialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Registration } from '@/types/dog-types';

interface AddEditRegistrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (registration: Registration) => void;
  initialData?: Registration; // For editing existing registration
}

const COMMON_BREEDS = [
  'Australian Cattle Dog',
  'Australian Shepherd',
  'Border Collie',
  'Golden Retriever',
  'Labrador Retriever',
  'German Shepherd Dog',
  'Poodle',
  'Standard Poodle',
  'Miniature Poodle',
  'Belgian Malinois',
  'Siberian Husky',
  'Jack Russell Terrier',
  'Papillon',
  'Shetland Sheepdog',
  'Shih Tzu',
  'Pembroke Welsh Corgi',
  'Mixed Breed',
  'All American Dog'
];

const REGISTRATION_ORGS = [
  'AKC (American Kennel Club)',
  'UKC (United Kennel Club)', 
  'CKC (Canadian Kennel Club)',
  'ILP (Indefinite Listing Privilege)',
  'PAL (Purebred Alternative Listing)',
  'Mixed Breed',
  'Other'
];

const INITIAL_REGISTRATION_DATA: Registration = {
  id: '',
  organization: '',
  registeredName: '',
  breed: '',
  registrationNumber: '',
  status: 'Active',
};

export const AddEditRegistrationDialog: React.FC<AddEditRegistrationDialogProps> = ({
  open,
  onOpenChange,
  onSave,
  initialData,
}) => {
  const [registrationData, setRegistrationData] = useState<Registration>(initialData || INITIAL_REGISTRATION_DATA);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setRegistrationData(initialData || INITIAL_REGISTRATION_DATA);
      setValidationErrors({});
    }
  }, [open, initialData]);

  const validateForm = (data: Registration): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!data.organization.trim()) errors.organization = 'Organization is required';
    if (!data.registeredName.trim()) errors.registeredName = 'Registered name is required';
    if (!data.breed.trim()) errors.breed = 'Breed is required';
    if (!data.registrationNumber.trim()) errors.registrationNumber = 'Registration number is required';
    return errors;
  };

  const handleFieldChange = (field: keyof Registration, value: string) => {
    setRegistrationData(prev => ({ ...prev, [field]: value }));
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleSubmit = () => {
    const errors = validateForm(registrationData);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    onSave({ ...registrationData, id: registrationData.id || `reg-${Date.now()}` });
    onOpenChange(false);
  };

  const isFormValid = (): boolean => {
    const errors = validateForm(registrationData);
    return Object.keys(errors).length === 0;
  };

  return (
    <AppleDialog
      open={open}
      onOpenChange={onOpenChange}
      onSave={handleSubmit}
      onCancel={() => onOpenChange(false)}
      title={initialData ? "Edit Registration" : "Add New Registration"}
      saveLabel="Save Registration"
      saveDisabled={!isFormValid()}
      maxWidth="lg"
    >
      <AppleFormField 
        label="Registration Organization" 
        required 
        error={validationErrors.organization}
      >
        <Select
          value={registrationData.organization}
          onValueChange={(value) => handleFieldChange('organization', value)}
        >
          <SelectTrigger className="form-select">
            <SelectValue placeholder="Select organization" />
          </SelectTrigger>
          <SelectContent>
            {REGISTRATION_ORGS.map(org => (
              <SelectItem key={org} value={org}>
                {org}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </AppleFormField>

      <AppleFormField 
        label="Registered Name" 
        required 
        error={validationErrors.registeredName}
      >
        <Input
          value={registrationData.registeredName}
          onChange={(e) => handleFieldChange('registeredName', e.target.value)}
          placeholder="Full registered name"
          className="form-input"
        />
      </AppleFormField>

      <AppleFormField 
        label="Registered Breed" 
        required 
        error={validationErrors.breed}
      >
        <Select
          value={registrationData.breed}
          onValueChange={(value) => handleFieldChange('breed', value)}
        >
          <SelectTrigger className="form-select">
            <SelectValue placeholder="Select breed" />
          </SelectTrigger>
          <SelectContent>
            {COMMON_BREEDS.map(breed => (
              <SelectItem key={breed} value={breed}>
                {breed}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </AppleFormField>

      <AppleFormGrid columns={2}>
        <AppleFormField 
          label="Registration Number" 
          required 
          error={validationErrors.registrationNumber}
        >
          <Input
            value={registrationData.registrationNumber}
            onChange={(e) => handleFieldChange('registrationNumber', e.target.value)}
            placeholder="Enter registration number"
            className="form-input"
          />
        </AppleFormField>

        <AppleFormField label="Status">
          <Select
            value={registrationData.status}
            onValueChange={(value) => handleFieldChange('status', value)}
          >
            <SelectTrigger className="form-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </AppleFormField>
      </AppleFormGrid>
    </AppleDialog>
  );
};