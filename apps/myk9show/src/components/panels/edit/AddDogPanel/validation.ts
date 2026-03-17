import { z } from 'zod';
import type { Registration } from '@/types/dog-types';
import type { DogFormData } from './types';

/**
 * Zod schema for AddDogPanel form data.
 * Replaces the legacy validateDogData function.
 */
export const addDogSchema = z.object({
  callName: z.string().min(1, 'Please enter a call name'),
  gender: z
    .enum(['Male', 'Female', ''] as const, { message: 'Please select a gender' })
    .refine(v => v !== '', 'Please select a gender'),
  dateOfBirth: z
    .string()
    .min(1, 'Please enter a date of birth')
    .refine(
      val => {
        if (!val) return true;
        const d = new Date(val);
        return d <= new Date();
      },
      'Date of birth cannot be in the future'
    )
    .refine(
      val => {
        if (!val) return true;
        const d = new Date(val);
        return d >= new Date(new Date().getFullYear() - 30, 0, 1);
      },
      'Date of birth seems too far in the past'
    ),
  ownerId: z.string().min(1, 'Please select an owner'),
  color: z.string(),
  height: z.string(),
  weight: z.string(),
  microchip: z.string(),
  spayedNeutered: z.boolean(),
  imageUrl: z.string(),
  registrations: z.custom<Registration[]>(val => Array.isArray(val), {
    message: 'Invalid registrations',
  }),
});

/**
 * Check whether a specific tab's required fields have been filled in.
 * Works with the form's data directly — does NOT re-run Zod validation.
 */
export const isTabValid = (tab: string, formData: DogFormData): boolean => {
  switch (tab) {
    case 'basic':
      return !!(
        formData.callName?.trim() &&
        formData.gender &&
        formData.dateOfBirth &&
        formData.ownerId
      );
    case 'registration':
      if (formData.registrations.length === 0) return true;
      return formData.registrations.every(
        reg =>
          reg.organization?.trim() &&
          reg.registeredName?.trim() &&
          reg.breed?.trim() &&
          reg.registrationNumber?.trim()
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
