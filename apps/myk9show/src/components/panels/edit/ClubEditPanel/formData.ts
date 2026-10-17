import { z } from 'zod';
import { clubSchemas } from '@/lib/validation';
import type { Club } from '@/types/club-types';
import { DEFAULT_COUNTRY } from '@/types/club-types';
import {
  CLUB_NUMBER_REQUIRED_MESSAGE,
  hasClubRegistryNumber,
  normalizeClubRegistryNumbers,
  type ClubRegistryOrg,
} from '@/utils/clubRegistryNumbers';

// Zod schema for club edit form
export const clubEditSchema = clubSchemas.basic;

/**
 * MYK9-1235: a club that has a registry number cannot be edited down to none,
 * so the Edit Club panel adds the at-least-one rule when the club had any. A
 * club with no number yet (legacy rows) can still be saved, and Add Club does
 * not ask for numbers at all: a new club has no server row to hang them on
 * until its queued INSERT uploads.
 */
export const clubEditSchemaFor = (requireClubNumber: boolean) =>
  requireClubNumber
    ? clubEditSchema.superRefine((data, ctx) => {
        if (
          !hasClubRegistryNumber({
            AKC: data.akcClubNumber,
            UKC: data.ukcClubNumber,
            ASCA: data.ascaClubNumber,
          })
        ) {
          ctx.addIssue({
            code: 'custom',
            message: CLUB_NUMBER_REQUIRED_MESSAGE,
            path: ['akcClubNumber'],
          });
        }
      })
    : clubEditSchema;

/** The form field that holds an organization's club number. */
export const clubNumberField = (org: ClubRegistryOrg) =>
  `${org.toLowerCase()}ClubNumber` as 'akcClubNumber' | 'ukcClubNumber' | 'ascaClubNumber';

// Form data type derived from the Zod schema
export type ClubEditFormData = z.infer<typeof clubEditSchema> & Record<string, unknown>;

// Convert Club to form data
export const clubToFormData = (club: Partial<Club>): ClubEditFormData => {
  return {
    name: club.name || '',
    akcClubNumber: club.registryNumbers?.AKC ?? '',
    ukcClubNumber: club.registryNumbers?.UKC ?? '',
    ascaClubNumber: club.registryNumbers?.ASCA ?? '',
    email: club.email || '',
    phone: club.phone || '',
    website: club.website || '',
    description: club.description || '',
    logo: club.logo || '',
    street: club.address?.street || '',
    city: club.address?.city || '',
    state: club.address?.state || '',
    zipCode: club.address?.zipCode || '',
    country: club.address?.country || DEFAULT_COUNTRY,
    founded: club.founded ? new Date(club.founded).toISOString().slice(0, 10) : '',
    clubType: club.clubType || '',
    accentColor: club.accentColor || '',
  };
};

// Convert form data back to Club
export const formDataToClub = (formData: ClubEditFormData): Partial<Club> => ({
  name: formData.name,
  registryNumbers: normalizeClubRegistryNumbers({
    AKC: formData.akcClubNumber,
    UKC: formData.ukcClubNumber,
    ASCA: formData.ascaClubNumber,
  }),
  email: formData.email,
  phone: formData.phone,
  website: formData.website || undefined,
  description: formData.description ?? '',
  logo: formData.logo ?? '',
  address: {
    street: formData.street,
    city: formData.city,
    state: formData.state,
    zipCode: formData.zipCode,
    country: formData.country,
  },
  founded: formData.founded ? new Date(formData.founded) : undefined,
  clubType: (formData.clubType as Club['clubType']) || undefined,
  accentColor: formData.accentColor ?? '',
});
