import React, { useMemo } from 'react';
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
import { useFormValidation } from '@/hooks/useFormValidation';
import { z } from 'zod';

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

const REGISTRATION_STATUS_VALUES = ['Active', 'Pending', 'Expired', 'Under review'] as const;

const registrationFormSchema = z.object({
  id: z.string().max(64),
  organization: z.string().min(1, 'Please select an organization.').max(120),
  registeredName: z.string().min(1, 'Please enter a registered name.').max(200),
  breed: z.string().min(1, 'Please select a breed.').max(120),
  variety: z.string().max(120).optional(),
  registrationNumber: z
    .string()
    .min(1, 'Please enter a registration number.')
    .max(64)
    .regex(/^[A-Za-z0-9\-/]+$/, 'Only letters, numbers, hyphens, and slashes are allowed.'),
  status: z.enum(REGISTRATION_STATUS_VALUES),
  applicationNumber: z.string().max(64).optional(),
  submissionDate: z.string().max(40).optional(),
  registrationDate: z.string().max(40).optional(),
  certificate: z.string().max(500).optional(),
});

type RegistrationFormData = z.infer<typeof registrationFormSchema>;

const INITIAL_REGISTRATION_DATA: RegistrationFormData = {
  id: '',
  organization: '',
  registeredName: '',
  breed: '',
  variety: '',
  registrationNumber: '',
  status: 'Active',
};

function generateRegistrationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `reg-${crypto.randomUUID()}`;
  }
  return `reg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const AddEditRegistrationDialog: React.FC<AddEditRegistrationDialogProps> = ({
  open,
  onOpenChange,
  onSave,
  initialData,
}) => {
  const toFormData = (reg: Registration): RegistrationFormData => {
    const status = (REGISTRATION_STATUS_VALUES as readonly string[]).includes(reg.status)
      ? (reg.status as (typeof REGISTRATION_STATUS_VALUES)[number])
      : 'Active';
    return {
      id: reg.id,
      organization: reg.organization,
      registeredName: reg.registeredName,
      breed: reg.breed,
      variety: reg.variety,
      registrationNumber: reg.registrationNumber,
      status,
      applicationNumber: reg.applicationNumber,
      submissionDate: reg.submissionDate,
      registrationDate: reg.registrationDate,
      certificate: reg.certificate,
    };
  };

  const formInitial = initialData ? toFormData(initialData) : INITIAL_REGISTRATION_DATA;
  const form = useFormValidation(registrationFormSchema, formInitial);

  // Reset state when dialog opens or initialData changes
  const [wasOpen, setWasOpen] = React.useState(open);
  const [lastInitialData, setLastInitialData] = React.useState(initialData);

  if (open && (!wasOpen || initialData !== lastInitialData)) {
    setWasOpen(open);
    setLastInitialData(initialData);
    form.reset(initialData ? toFormData(initialData) : INITIAL_REGISTRATION_DATA);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  // Get the organization code for breed lookup
  const orgCode = useMemo(() => {
    return ORG_CODE_MAP[form.data.organization] || 'AKC';
  }, [form.data.organization]);

  // Get breeds for the selected organization
  const availableBreeds = useMemo(() => {
    if (!form.data.organization) return [];
    return getBreedNamesForOrganization(orgCode);
  }, [form.data.organization, orgCode]);

  // Get varieties for the selected breed
  const availableVarieties = useMemo(() => {
    if (!form.data.organization || !form.data.breed) return [];
    return getVarietiesForBreed(orgCode, form.data.breed);
  }, [form.data.organization, form.data.breed, orgCode]);

  const handleFieldChange = (field: keyof RegistrationFormData, value: string) => {
    form.setValue(field, value);
    form.touchField(field);
  };

  // Handle organization change - clear breed and variety
  const handleOrganizationChange = (value: string) => {
    form.setValues({ organization: value, breed: '', variety: '' });
    form.touchField('organization');
  };

  // Handle breed change - clear variety
  const handleBreedChange = (value: string) => {
    form.setValues({ breed: value, variety: '' });
    form.touchField('breed');
  };

  const onSubmitValid = (validatedData: RegistrationFormData) => {
    const registration: Registration = {
      id: validatedData.id || generateRegistrationId(),
      organization: validatedData.organization,
      registeredName: validatedData.registeredName,
      breed: validatedData.breed,
      registrationNumber: validatedData.registrationNumber,
      status: validatedData.status,
      ...(validatedData.variety != null && { variety: validatedData.variety }),
      ...(validatedData.applicationNumber != null && {
        applicationNumber: validatedData.applicationNumber,
      }),
      ...(validatedData.submissionDate != null && {
        submissionDate: validatedData.submissionDate,
      }),
      ...(validatedData.registrationDate != null && {
        registrationDate: validatedData.registrationDate,
      }),
      ...(validatedData.certificate != null && { certificate: validatedData.certificate }),
    };
    onSave(registration);
    onOpenChange(false);
  };
  const handleSubmit = form.handleSubmit(onSubmitValid);

  // Pre-compute errors for fields referenced multiple times
  const organizationError = form.getError('organization');
  const breedError = form.getError('breed');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{initialData ? 'Edit Registration' : 'Add New Registration'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 -mx-1 px-3 py-1">
          <FormField
            label="Registration Organization"
            fieldId="organization"
            required
            error={organizationError}
          >
            <Select value={form.data.organization} onValueChange={handleOrganizationChange}>
              <SelectTrigger
                id="organization"
                aria-invalid={!!organizationError}
                aria-describedby={organizationError ? 'organization-error' : undefined}
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
            error={form.getError('registeredName')}
          >
            <Input
              id="registeredName"
              value={form.data.registeredName}
              onChange={e => handleFieldChange('registeredName', e.target.value)}
              placeholder="Full registered name"
              {...form.getFieldProps('registeredName')}
            />
          </FormField>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Registered Breed" fieldId="breed" required error={breedError}>
              <Select
                value={form.data.breed}
                onValueChange={handleBreedChange}
                disabled={!form.data.organization}
              >
                <SelectTrigger
                  id="breed"
                  aria-invalid={!!breedError}
                  aria-describedby={breedError ? 'breed-error' : undefined}
                >
                  <SelectValue
                    placeholder={
                      form.data.organization ? 'Select breed' : 'Select organization first'
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
                  value={form.data.variety || ''}
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
                  value={form.data.variety || ''}
                  onChange={e => handleFieldChange('variety', e.target.value)}
                  placeholder={
                    form.data.breed ? 'No varieties for this breed' : 'Select breed first'
                  }
                  disabled={!form.data.breed}
                />
              )}
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Registration Number"
              fieldId="registrationNumber"
              required
              error={form.getError('registrationNumber')}
            >
              <Input
                id="registrationNumber"
                value={form.data.registrationNumber}
                onChange={e => handleFieldChange('registrationNumber', e.target.value)}
                placeholder="Enter registration number"
                {...form.getFieldProps('registrationNumber')}
              />
            </FormField>

            <FormField label="Status" fieldId="registrationStatus">
              <Select
                value={form.data.status}
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
