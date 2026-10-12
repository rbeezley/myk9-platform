/**
 * State and submit for the registration form an unsaved dog's registrations are
 * edited with (MYK9-1081). Rendered by `RegistrationFormBody`.
 */
import React, { useMemo, useState } from 'react';
import { Registration, REGISTRATION_STATUS_VALUES } from '@/types/dog-types';
import { rankBreedMatches } from './rankBreedMatches';
import { getBreedNamesForOrganization, getVarietiesForBreed } from '@/data/breedData';
import { useFormValidation } from '@/hooks/useFormValidation';
import { z } from 'zod';
import { toast } from 'sonner';

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

export const REGISTRATION_ORGS = [
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

interface UseRegistrationEditorOptions {
  /** The container's open state; the form re-seeds each time it opens. */
  open: boolean;
  /** Return false when an async save failed and the form should remain open. */
  onSave: (registration: Registration) => void | boolean | Promise<void | boolean>;
  initialData?: Registration | undefined;
  /** Called after a save the caller did not refuse: the container closes. */
  onSaved: () => void;
}

/** The registration form's state and submit, shared by both containers. */
export function useRegistrationEditor({
  open,
  onSave,
  initialData,
  onSaved,
}: UseRegistrationEditorOptions) {
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
  const filteredBreeds = useMemo(
    () => rankBreedMatches(availableBreeds, breedSearch).map(breed => ({ id: breed })),
    [availableBreeds, breedSearch]
  );

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

  const [isSaving, setIsSaving] = useState(false);

  const onSubmitValid = async (validatedData: RegistrationFormData) => {
    if (isSaving) return;

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
    setIsSaving(true);
    try {
      const saveResult = await onSave(registration);
      if (saveResult !== false) onSaved();
    } catch {
      toast.error("We couldn't save that registration. You can try again.");
    } finally {
      setIsSaving(false);
    }
  };
  const handleSubmit = form.handleSubmit(onSubmitValid);

  // Pre-compute errors for fields referenced multiple times
  const organizationError = form.getError('organization');
  const breedError = form.getError('breed');

  return {
    form,
    isSaving,
    handleSubmit,
    organizationError,
    breedError,
    availableVarieties,
    filteredBreeds,
    breedPickerOpen,
    setBreedPickerOpen,
    breedSearch,
    setBreedSearch,
    handleFieldChange,
    handleOrganizationChange,
    handleBreedChange,
  };
}

export type RegistrationEditor = ReturnType<typeof useRegistrationEditor>;
