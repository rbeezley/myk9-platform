/**
 * The registration form's field behaviour over a form it is handed: breed and
 * variety lists, the breed picker, and the change handlers (MYK9-1117).
 *
 * `useRegistrationEditor` hands it a form it owns (in-memory hosts); the Dog
 * Details panels hand it EditPanelWrapper's form (database hosts). Either way
 * `RegistrationFormBody` renders the result.
 */
import { useMemo, useState } from 'react';
import { rankBreedMatches } from './rankBreedMatches';
import { getBreedNamesForOrganization, getVarietiesForBreed } from '@/data/breedData';
import type { FormValidation } from '@/hooks/useFormValidation';
import { registrationOrgCode, type RegistrationFormData } from './registrationForm';

export function useRegistrationFormFields(form: FormValidation<RegistrationFormData>) {
  const orgCode = registrationOrgCode(form.data.organization);

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

  return {
    form,
    organizationError: form.getError('organization'),
    breedError: form.getError('breed'),
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

/** What every field piece of the registration form needs. */
export type RegistrationFieldsEditor = ReturnType<typeof useRegistrationFormFields>;
