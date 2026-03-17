import { z } from 'zod';
import { getDogDisplayName } from '@/types/dog-types';
import type { DogFormData, DogType, Registration } from './DogEditPanel.types';
import { UserRole } from './DogEditPanel.types';

/** Zod schema for DogFormData validation. */
export const dogFormSchema = z.object({
  callName: z.string().min(1, 'Please enter a call name'),
  registeredName: z.string().min(1, 'Please enter a registered name'),
  gender: z.string().min(1, 'Please select a gender'),
  dateOfBirth: z.string().min(1, 'Please enter a date of birth'),
  color: z.string(),
  weight: z.string(),
  height: z.string(),
  microchip: z.string(),
  imageUrl: z.string().optional(),
  ownerId: z.string(),
  registrations: z.custom<Registration[]>(val => Array.isArray(val)),
  healthRecords: z.custom<DogType['healthRecords']>(
    val => val === undefined || val === null || typeof val === 'object'
  ),
  notes: z.string().optional(),
  specialNeeds: z.string().optional(),
  spayedNeutered: z.boolean().optional(),
}) as unknown as z.ZodSchema<DogFormData>;

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
