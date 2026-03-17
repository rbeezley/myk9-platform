import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/FormField';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Registration } from '@/types/dog-types';
import { getBreedNamesForOrganization, getVarietiesForBreed } from '@/data/breedData';

interface AddEditRegistrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (registration: Registration) => void;
  initialData?: Registration | undefined; // For editing existing registration
}

// Map display names to organization codes for breedData lookup
const ORG_CODE_MAP: Record<string, string> = {
  'AKC (American Kennel Club)': 'AKC',
  'UKC (United Kennel Club)': 'UKC',
  'CKC (Canadian Kennel Club)': 'CKC',
  'FCI (Fédération Cynologique Internationale)': 'FCI',
  'KC (The Kennel Club UK)': 'KC',
  'ILP (Indefinite Listing Privilege)': 'AKC', // ILP is an AKC program
  'PAL (Purebred Alternative Listing)': 'AKC', // PAL is an AKC program
  'Mixed Breed': 'AKC',
  Other: 'Other',
};

const REGISTRATION_ORGS = [
  'AKC (American Kennel Club)',
  'UKC (United Kennel Club)',
  'CKC (Canadian Kennel Club)',
  'FCI (Fédération Cynologique Internationale)',
  'KC (The Kennel Club UK)',
  'ILP (Indefinite Listing Privilege)',
  'PAL (Purebred Alternative Listing)',
  'Mixed Breed',
  'Other',
];

const INITIAL_REGISTRATION_DATA: Registration = {
  id: '',
  organization: '',
  registeredName: '',
  breed: '',
  variety: '',
  registrationNumber: '',
  status: 'Active',
};

export const AddEditRegistrationDialog: React.FC<AddEditRegistrationDialogProps> = ({
  open,
  onOpenChange,
  onSave,
  initialData,
}) => {
  const [registrationData, setRegistrationData] = useState<Registration>(
    initialData || INITIAL_REGISTRATION_DATA
  );
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [wasOpen, setWasOpen] = useState(open);
  const [lastInitialData, setLastInitialData] = useState(initialData);
  // Track if form has been submitted - only show errors after first submit attempt
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Reset state when dialog opens or initialData changes
  if (open && (!wasOpen || initialData !== lastInitialData)) {
    setWasOpen(open);
    setLastInitialData(initialData);
    setRegistrationData(initialData || INITIAL_REGISTRATION_DATA);
    setValidationErrors({});
    setHasSubmitted(false);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  // Helper to get visible error (only show after first submit attempt)
  const getVisibleError = (field: string): string | undefined => {
    return hasSubmitted ? validationErrors[field] : undefined;
  };

  // Get the organization code for breed lookup
  const orgCode = useMemo(() => {
    return ORG_CODE_MAP[registrationData.organization] || 'AKC';
  }, [registrationData.organization]);

  // Get breeds for the selected organization
  const availableBreeds = useMemo(() => {
    if (!registrationData.organization) return [];
    return getBreedNamesForOrganization(orgCode);
  }, [registrationData.organization, orgCode]);

  // Get varieties for the selected breed
  const availableVarieties = useMemo(() => {
    if (!registrationData.organization || !registrationData.breed) return [];
    return getVarietiesForBreed(orgCode, registrationData.breed);
  }, [registrationData.organization, registrationData.breed, orgCode]);

  const validateForm = (data: Registration): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!data.organization.trim()) errors.organization = 'Please select an organization.';
    if (!data.registeredName.trim()) errors.registeredName = 'Please enter a registered name.';
    if (!data.breed.trim()) errors.breed = 'Please select a breed.';
    if (!data.registrationNumber.trim())
      errors.registrationNumber = 'Please enter a registration number.';
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

  // Handle organization change - clear breed and variety
  const handleOrganizationChange = (value: string) => {
    setRegistrationData(prev => ({
      ...prev,
      organization: value,
      breed: '',
      variety: '',
    }));
    if (validationErrors.organization) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.organization;
        return newErrors;
      });
    }
  };

  // Handle breed change - clear variety
  const handleBreedChange = (value: string) => {
    setRegistrationData(prev => ({
      ...prev,
      breed: value,
      variety: '',
    }));
    if (validationErrors.breed) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.breed;
        return newErrors;
      });
    }
  };

  const handleSubmit = () => {
    // Mark that we've attempted to submit - this enables error display
    setHasSubmitted(true);

    const errors = validateForm(registrationData);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    onSave({ ...registrationData, id: registrationData.id || `reg-${Date.now()}` });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{initialData ? 'Edit Registration' : 'Add New Registration'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 pr-2">
          <FormField
            label="Registration Organization"
            fieldId="organization"
            required
            error={getVisibleError('organization')}
          >
            <Select value={registrationData.organization} onValueChange={handleOrganizationChange}>
              <SelectTrigger
                id="organization"
                aria-invalid={!!getVisibleError('organization')}
                aria-describedby={
                  getVisibleError('organization') ? 'organization-error' : undefined
                }
              >
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
          </FormField>

          <FormField
            label="Registered Name"
            fieldId="registeredName"
            required
            error={getVisibleError('registeredName')}
          >
            <Input
              id="registeredName"
              value={registrationData.registeredName}
              onChange={e => handleFieldChange('registeredName', e.target.value)}
              placeholder="Full registered name"
              aria-invalid={!!getVisibleError('registeredName')}
              aria-describedby={
                getVisibleError('registeredName') ? 'registeredName-error' : undefined
              }
            />
          </FormField>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label="Registered Breed"
              fieldId="breed"
              required
              error={getVisibleError('breed')}
            >
              <Select
                value={registrationData.breed}
                onValueChange={handleBreedChange}
                disabled={!registrationData.organization}
              >
                <SelectTrigger
                  id="breed"
                  aria-invalid={!!getVisibleError('breed')}
                  aria-describedby={getVisibleError('breed') ? 'breed-error' : undefined}
                >
                  <SelectValue
                    placeholder={
                      registrationData.organization ? 'Select breed' : 'Select organization first'
                    }
                  />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {availableBreeds.map(breed => (
                    <SelectItem key={breed} value={breed}>
                      {breed}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Variety" fieldId="variety">
              {availableVarieties.length > 0 ? (
                <Select
                  value={registrationData.variety || ''}
                  onValueChange={value => handleFieldChange('variety', value)}
                >
                  <SelectTrigger id="variety">
                    <SelectValue placeholder="Select variety" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableVarieties.map(variety => (
                      <SelectItem key={variety} value={variety}>
                        {variety}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="variety"
                  value={registrationData.variety || ''}
                  onChange={e => handleFieldChange('variety', e.target.value)}
                  placeholder={
                    registrationData.breed ? 'No varieties for this breed' : 'Select breed first'
                  }
                  disabled={!registrationData.breed}
                />
              )}
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Registration Number"
              fieldId="registrationNumber"
              required
              error={getVisibleError('registrationNumber')}
            >
              <Input
                id="registrationNumber"
                value={registrationData.registrationNumber}
                onChange={e => handleFieldChange('registrationNumber', e.target.value)}
                placeholder="Enter registration number"
                aria-invalid={!!getVisibleError('registrationNumber')}
                aria-describedby={
                  getVisibleError('registrationNumber') ? 'registrationNumber-error' : undefined
                }
              />
            </FormField>

            <FormField label="Status" fieldId="registrationStatus">
              <Select
                value={registrationData.status}
                onValueChange={value => handleFieldChange('status', value)}
              >
                <SelectTrigger id="registrationStatus">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Expired">Expired</SelectItem>
                  <SelectItem value="Under review">Under review</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>Save Registration</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
