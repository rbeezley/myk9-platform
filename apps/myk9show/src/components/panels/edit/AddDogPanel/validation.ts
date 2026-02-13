import type { DogFormData } from './types';

/**
 * Validates a DogFormData object and returns a record of field-level error messages.
 * An empty record means the form is valid.
 */
export const validateDogData = (data: DogFormData): Record<string, string> => {
  const errors: Record<string, string> = {};

  // Basic information validation
  if (!data.callName.trim()) errors.callName = 'Call name is required';
  if (!data.gender) errors.gender = 'Gender is required';
  if (!data.dateOfBirth) errors.dateOfBirth = 'Date of birth is required';
  if (!data.ownerId) errors.ownerId = 'Owner is required';

  // Date validation
  if (data.dateOfBirth) {
    const birthDate = new Date(data.dateOfBirth);
    const now = new Date();
    if (birthDate > now) {
      errors.dateOfBirth = 'Date of birth cannot be in the future';
    }
    if (birthDate < new Date(now.getFullYear() - 30, 0, 1)) {
      errors.dateOfBirth = 'Date of birth seems too far in the past';
    }
  }

  // Registration validation
  data.registrations.forEach((reg, index) => {
    if (!reg.organization.trim()) errors[`registration-${index}-organization`] = 'Organization is required';
    if (!reg.registeredName.trim()) errors[`registration-${index}-registeredName`] = 'Registered name is required';
    if (!reg.breed.trim()) errors[`registration-${index}-breed`] = 'Breed is required';
    if (!reg.registrationNumber.trim()) errors[`registration-${index}-registrationNumber`] = 'Registration number is required';
  });

  return errors;
};

/**
 * Check whether a specific tab's fields are all valid.
 */
export const isTabValid = (tab: string, formData: DogFormData): boolean => {
  const errors = validateDogData(formData);
  switch (tab) {
    case 'basic':
      return !errors.callName && !errors.gender && !errors.dateOfBirth && !errors.ownerId;
    case 'registration':
      if (formData.registrations.length === 0) return true;
      return formData.registrations.every((_, index) =>
        !errors[`registration-${index}-organization`] &&
        !errors[`registration-${index}-registeredName`] &&
        !errors[`registration-${index}-breed`] &&
        !errors[`registration-${index}-registrationNumber`]
      );
    case 'optional':
      return true;
    default:
      return true;
  }
};

/**
 * Calculate a human-readable age string from a date-of-birth string.
 */
export const calculateAge = (dateOfBirth: string): string => {
  if (!dateOfBirth) return '';

  const birth = new Date(dateOfBirth);
  const now = new Date();
  const years = now.getFullYear() - birth.getFullYear();
  const months = now.getMonth() - birth.getMonth();

  if (years === 0) {
    return `${months + (months === 1 ? ' month' : ' months')}`;
  } else if (months < 0) {
    return `${years - 1} years, ${12 + months} months`;
  } else if (months === 0) {
    return `${years} ${years === 1 ? 'year' : 'years'}`;
  } else {
    return `${years} years, ${months} months`;
  }
};
