import { z } from 'zod';
import { REGISTRATION_STATUS_VALUES, type Registration } from '@/types/dog-types';
import { parseLocalDateString } from '@/utils/dateLocal';
import type { DogFormData } from './types';

const MAX_IMAGE_URL_LENGTH = 7 * 1024 * 1024; // ~5 MB of image data as base64 (JS string length, not bytes)

/**
 * Strict DOB parser. Only accepts ISO `YYYY-MM-DD` (what `<input type="date">`
 * produces) and rejects inputs that silently roll over like Feb 30 → March 1.
 * Other formats (`MM/DD/YYYY`, natural-language) are rejected outright so the
 * UI can't drift away from the canonical ISO form.
 */
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const parseStrictDob = (val: string): Date | null => {
  const match = ISO_DATE_PATTERN.exec(val);
  if (!match) return null;
  const d = parseLocalDateString(val);
  if (!d) return null;
  const day = Number(match[3]);
  return d.getDate() === day ? d : null;
};

const REG_NUMBER_PATTERN = /^[A-Za-z0-9\-/]+$/;

const isValidString = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length <= max;

const isValidOptionalString = (v: unknown, max: number): boolean =>
  v === undefined || (typeof v === 'string' && v.length <= max);

const isRegistration = (v: unknown): v is Registration => {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    isValidString(r.id, 64) &&
    isValidString(r.organization, 120) &&
    r.organization.length > 0 &&
    isValidString(r.registeredName, 200) &&
    r.registeredName.length > 0 &&
    isValidString(r.breed, 120) &&
    r.breed.length > 0 &&
    isValidOptionalString(r.variety, 120) &&
    isValidString(r.registrationNumber, 64) &&
    r.registrationNumber.length > 0 &&
    REG_NUMBER_PATTERN.test(r.registrationNumber) &&
    typeof r.status === 'string' &&
    (REGISTRATION_STATUS_VALUES as readonly string[]).includes(r.status) &&
    isValidOptionalString(r.applicationNumber, 64) &&
    isValidOptionalString(r.submissionDate, 40) &&
    isValidOptionalString(r.registrationDate, 40) &&
    isValidOptionalString(r.certificate, 500)
  );
};

/**
 * Zod schema for AddDogPanel form data.
 * Replaces the legacy validateDogData function.
 */
export const addDogSchema = z.object({
  callName: z.string().min(1, 'Please enter a call name').max(120, 'Call name is too long'),
  gender: z
    .enum(['Male', 'Female', ''] as const, { message: 'Please select a gender' })
    .refine(v => v !== '', 'Please select a gender'),
  dateOfBirth: z
    .string()
    .min(1, 'Please enter a date of birth')
    .superRefine((val, ctx) => {
      const d = parseStrictDob(val);
      if (!d) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Please enter a valid date' });
        return;
      }
      if (d > new Date()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Date of birth cannot be in the future',
        });
        return;
      }
      const earliestAllowed = new Date(new Date().getFullYear() - 30, 0, 1);
      if (d < earliestAllowed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Date of birth seems too far in the past',
        });
      }
    }),
  ownerId: z.string().min(1, 'Please select an owner').max(64),
  color: z.string().max(60, 'Color is too long'),
  height: z.string().max(20, 'Height is too long'),
  weight: z.string().max(20, 'Weight is too long'),
  microchip: z
    .string()
    .max(30)
    .refine(
      val => !val || /^[A-Za-z0-9]{9,20}$/.test(val),
      'Microchip must be 9-20 alphanumeric characters'
    ),
  spayedNeutered: z.boolean(),
  imageUrl: z
    .string()
    .max(MAX_IMAGE_URL_LENGTH, 'Photo is too large')
    .refine(
      val => !val || val.startsWith('data:image/') || /^https?:\/\//i.test(val),
      'Photo must be an image'
    ),
  registrations: z.custom<Registration[]>(val => Array.isArray(val) && val.every(isRegistration), {
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
 * Handles invalid dates, future dates, timezone drift, and day-of-month rollovers.
 */
export const calculateAge = (dateOfBirth: string): string => {
  if (!dateOfBirth) return '';

  const birth = parseStrictDob(dateOfBirth);
  if (!birth) return '';

  const now = new Date();
  if (birth > now) return '';

  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();

  if (now.getDate() < birth.getDate()) {
    months -= 1;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years < 0) return '';

  if (years === 0) {
    return `${months} ${months === 1 ? 'month' : 'months'}`;
  }
  if (months === 0) {
    return `${years} ${years === 1 ? 'year' : 'years'}`;
  }
  return `${years} ${years === 1 ? 'year' : 'years'}, ${months} ${months === 1 ? 'month' : 'months'}`;
};
