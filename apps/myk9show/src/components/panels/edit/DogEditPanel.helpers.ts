import { getDogDisplayName } from '@/types/dog-types';
import type { DogFormData, DogType, Registration } from './DogEditPanel.types';
import { UserRole } from './DogEditPanel.types';

/** Validate dog form data, returning an array of error messages or null if valid. */
export const validateDogData = (data: DogFormData): string[] | null => {
  const errors: string[] = [];

  if (!data.callName?.trim()) {
    errors.push('Please enter a call name');
  }

  if (!data.registeredName?.trim()) {
    errors.push('Please enter a registered name');
  }

  if (!data.gender) {
    errors.push('Please select a gender');
  }

  if (!data.dateOfBirth) {
    errors.push('Please enter a date of birth');
  }

  // Note: ownerId is not validated here - it's set during dog creation
  // and preserved during editing. Owner changes should be handled separately.

  // Validate registrations if present
  data.registrations?.forEach((reg, index) => {
    if (!reg.organization) {
      errors.push(`Registration ${index + 1}: Organization is required`);
    }
    if (!reg.registrationNumber?.trim()) {
      errors.push(`Registration ${index + 1}: Registration number is required`);
    }
  });

  return errors.length > 0 ? errors : null;
};

/** Convert DogType to form data for the edit panel. */
export const dogToFormData = (dog: Partial<DogType>): DogFormData => {
  // Get registered name from first registration if available, fall back to dog name
  const registeredName = dog.registrations?.[0]?.registeredName || dog.name || '';

  // Derive gender from sex if not set (use lowercase to match Select values)
  const gender =
    dog.gender?.toLowerCase() ||
    (dog.sex === 'male' ? 'male' : dog.sex === 'female' ? 'female' : '');

  return {
    callName: getDogDisplayName({ callName: dog.callName, name: dog.name || '' }),
    registeredName,
    gender,
    dateOfBirth: dog.dateOfBirth || dog.birthDate || '',
    color: dog.color || '',
    weight: dog.weight || dog.measurements?.weight?.toString() || '',
    height: dog.height || dog.measurements?.height?.toString() || '',
    microchip: dog.microchip || dog.microchipNumber || '',
    imageUrl: dog.imageUrl || '',
    ownerId: dog.ownerId || '',
    registrations: (dog.registrations as Registration[]) || [],
    healthRecords: dog.healthRecords || {},
    notes: ((dog as Record<string, unknown>).notes as string) || '',
    specialNeeds: ((dog as Record<string, unknown>).specialNeeds as string) || '',
    spayedNeutered: dog.spayedNeutered ?? false,
  };
};

/** Convert form data back to DogType for saving. */
export const formDataToDog = (formData: DogFormData): Partial<DogType> => {
  // Update or create registrations with the registered name
  let registrations = formData.registrations || [];

  if (formData.registeredName) {
    if (registrations.length > 0) {
      // Update the first registration's registeredName with the form field value
      registrations = registrations.map((reg, index) =>
        index === 0 ? { ...reg, registeredName: formData.registeredName } : reg
      );
    } else {
      // Create a new registration if none exist but user entered a registered name
      // Use a temporary ID - the database will generate the real one on save
      registrations = [
        {
          id: `temp-${Date.now()}`,
          organization: 'AKC', // Default organization
          registeredName: formData.registeredName,
          registrationNumber: '',
          breed: '',
          status: 'pending',
        },
      ];
    }
  }

  return {
    callName: formData.callName,
    name: formData.callName, // Keep both for compatibility
    gender: formData.gender as 'Male' | 'Female' | '',
    ...(formData.gender ? { sex: formData.gender.toLowerCase() as 'male' | 'female' } : {}),
    dateOfBirth: formData.dateOfBirth,
    birthDate: formData.dateOfBirth, // Keep both for compatibility
    color: formData.color,
    weight: formData.weight,
    height: formData.height,
    measurements: {
      weight: formData.weight ? parseFloat(formData.weight) : undefined,
      height: formData.height ? parseFloat(formData.height) : undefined,
    },
    microchip: formData.microchip,
    microchipNumber: formData.microchip, // Keep both for compatibility
    imageUrl: formData.imageUrl,
    ownerId: formData.ownerId,
    registrations,
    healthRecords: formData.healthRecords,
    ...(formData.notes && ({ notes: formData.notes } as Record<string, unknown>)),
    ...(formData.specialNeeds &&
      ({ specialNeeds: formData.specialNeeds } as Record<string, unknown>)),
    spayedNeutered: formData.spayedNeutered,
  };
};

/** Check if user has admin privileges. */
export const isAdminRole = (role?: UserRole): boolean => {
  return (
    role === UserRole.SITE_ADMIN || role === UserRole.CLUB_ADMIN || role === UserRole.SECRETARY
  );
};
