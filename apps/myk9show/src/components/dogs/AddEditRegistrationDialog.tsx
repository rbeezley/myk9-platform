import React, { useMemo, useState } from 'react';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/FormField';
import { SearchablePopover } from '@/components/ui/searchable-popover';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Registration, REGISTRATION_STATUS_VALUES } from '@/types/dog-types';
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

  // 4.E: the breed list is ~200 options — a bare dropdown is unnavigable for a
  // novice. Make it a searchable popover. Items must be { id } shaped.
  const [breedPickerOpen, setBreedPickerOpen] = useState(false);
  const [breedSearch, setBreedSearch] = useState('');
  const filteredBreeds = useMemo(() => {
    const q = breedSearch.trim().toLowerCase();
    return availableBreeds
      .filter(breed => !q || breed.toLowerCase().includes(q))
      .map(breed => ({ id: breed }));
  }, [availableBreeds, breedSearch]);

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

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <Button variant="outline" onClick={() => onOpenChange(false)}>
        Cancel
      </Button>
      <Button onClick={handleSubmit}>Save Registration</Button>
    </div>
  );

  return (
    <SlideOverPanel
      open={open}
      onClose={() => onOpenChange(false)}
      title={initialData ? 'Edit Registration' : 'Add New Registration'}
      // User testing: at "md" (max-w-lg) the two-column breed/variety and
      // number/status rows were too cramped to read, forcing a scroll through
      // what is only six fields. "lg" (max-w-2xl) fits the form without
      // scrolling while staying narrower than the "xl" Add Dog wizard it
      // layers on top of, so the nesting still reads as a sub-step.
      size="lg"
      footer={footer}
    >
      <div className="space-y-4 p-6">
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
            {form.data.organization ? (
              <SearchablePopover
                id="breed"
                aria-invalid={!!breedError}
                aria-describedby={breedError ? 'breed-error' : undefined}
                open={breedPickerOpen}
                onOpenChange={next => {
                  setBreedPickerOpen(next);
                  if (!next) setBreedSearch('');
                }}
                triggerLabel={form.data.breed || 'Select breed'}
                searchPlaceholder="Search breeds…"
                searchTerm={breedSearch}
                onSearchChange={setBreedSearch}
                items={filteredBreeds}
                emptyMessage="No breeds match your search"
                renderItem={breed => (
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center justify-between gap-2 p-3 text-left text-sm hover:bg-muted border-b last:border-b-0',
                      breed.id === form.data.breed && 'bg-muted/60 font-medium'
                    )}
                    onClick={() => {
                      handleBreedChange(breed.id);
                      setBreedPickerOpen(false);
                      setBreedSearch('');
                    }}
                  >
                    {breed.id}
                    {breed.id === form.data.breed && <Check className="h-4 w-4 text-primary" />}
                  </button>
                )}
              />
            ) : (
              <Button
                id="breed"
                type="button"
                variant="outline"
                disabled
                className="w-full justify-start text-muted-foreground"
              >
                Select organization first
              </Button>
            )}
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
                placeholder={form.data.breed ? 'No varieties for this breed' : 'Select breed first'}
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
            {/* User testing: nothing signalled that the organization must be
                chosen first, so exhibitors typed a number into a field whose
                format depends on a registry they hadn't picked yet. Gate it
                the same way the breed picker above is gated — one consistent
                "organization first" rule across the whole form, stated in the
                placeholder rather than only discovered on validation. */}
            <Input
              id="registrationNumber"
              value={form.data.registrationNumber}
              onChange={e => handleFieldChange('registrationNumber', e.target.value)}
              placeholder={
                form.data.organization ? 'Enter registration number' : 'Select organization first'
              }
              disabled={!form.data.organization}
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
    </SlideOverPanel>
  );
};
