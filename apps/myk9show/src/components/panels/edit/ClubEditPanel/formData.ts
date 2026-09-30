import { z } from 'zod';
import { clubSchemas } from '@/lib/validation';
import type { Club } from '@/types/club-types';
import { DEFAULT_COUNTRY } from '@/types/club-types';

// Zod schema for club edit form
export const clubEditSchema = clubSchemas.basic;

// Form data type derived from the Zod schema
export type ClubEditFormData = z.infer<typeof clubEditSchema> & Record<string, unknown>;

// Convert Club to form data
export const clubToFormData = (club: Partial<Club>): ClubEditFormData => {
  return {
    name: club.name || '',
    clubNumber: club.clubNumber || '',
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
  clubNumber: formData.clubNumber ?? '',
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
