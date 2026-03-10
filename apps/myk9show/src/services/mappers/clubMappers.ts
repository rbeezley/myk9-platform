// Type mapping utilities for Club entity between Zustand and Supabase
import type { Club, ClubInput, ClubAddress } from '@/types/club-types';
import type { DbClub, DbClubInsert, DbClubUpdate } from '@/types/database-mappings';
import { logger } from '@/services/LoggingService';

/**
 * Maps ClubInput (from Zustand store) to DbClubInsert (for Supabase insertion)
 */
export const mapClubInputToInsert = (input: ClubInput): DbClubInsert => {
  // Combine address fields into a single string for the database
  const fullAddress = `${input.street}, ${input.city}, ${input.state} ${input.zipCode}, ${input.country}`;

  return {
    name: input.name,
    email: input.email || null,
    phone: input.phone || null,
    website: input.website || null,
    description: input.description || null,
    logo_url: input.logo || null,
    cover_image_url: input.coverImage || null,
    accent_color: input.accentColor || null,
    address: fullAddress,
    // Store city, state, zip_code in their dedicated columns for search
    city: input.city || null,
    state: input.state || null,
    zip_code: input.zipCode || null,
    club_number: input.clubNumber || null,
  };
};

/**
 * Maps ClubInput (from Zustand store) to DbClubUpdate (for Supabase updates)
 */
export const mapClubInputToUpdate = (input: Partial<ClubInput>): DbClubUpdate => {
  const update: DbClubUpdate = {};

  if (input.name !== undefined) update.name = input.name;
  if (input.email !== undefined) update.email = input.email || null;
  if (input.phone !== undefined) update.phone = input.phone || null;
  if (input.website !== undefined) update.website = input.website || null;
  if (input.description !== undefined) update.description = input.description || null;
  if (input.logo !== undefined) update.logo_url = input.logo || null;
  if (input.clubNumber !== undefined) update.club_number = input.clubNumber || null;

  // Handle address fields - update individual columns and the combined address string
  if (input.city !== undefined) update.city = input.city || null;
  if (input.state !== undefined) update.state = input.state || null;
  if (input.zipCode !== undefined) update.zip_code = input.zipCode || null;

  if (
    input.street !== undefined ||
    input.city !== undefined ||
    input.state !== undefined ||
    input.zipCode !== undefined ||
    input.country !== undefined
  ) {
    // Reconstruct the combined address string from available fields
    const addressParts = [
      input.street,
      input.city,
      input.state ? `${input.state} ${input.zipCode || ''}`.trim() : input.zipCode,
      input.country,
    ].filter(Boolean);

    if (addressParts.length > 0) {
      update.address = addressParts.join(', ');
    }
  }

  return update;
};

/**
 * Maps DbClub (from Supabase) to Club (for Zustand store)
 */
export const mapDatabaseToClub = (
  dbClub: DbClub & {
    show?: unknown[];
  }
): Club => {
  // Parse address: prefer dedicated city/state/zip_code columns, fall back to parsing address string
  const addressParts = dbClub.address?.split(', ') || [];
  const address: ClubAddress = {
    street: addressParts[0] || '',
    city: dbClub.city || addressParts[1] || '',
    state: dbClub.state || addressParts[2]?.split(' ')[0] || '',
    zipCode: dbClub.zip_code || addressParts[2]?.split(' ')[1] || '',
    country: addressParts[3] || 'US',
  };

  // Map shows from database format (if available)
  const shows = (dbClub.show || []).map((show: unknown) => {
    const showObj = show as Record<string, unknown>;
    return {
      id: showObj.id as string,
      name: showObj.name as string,
      date: showObj.start_date as string,
      location: (showObj.location as string) || '',
      description: (showObj.description as string) || '',
    };
  });

  // Separate upcoming and past shows based on date
  const now = new Date();
  const upcomingShows = shows.filter(show => new Date(show.date) >= now);
  const pastShows = shows.filter(show => new Date(show.date) < now);

  return {
    id: dbClub.id,
    name: dbClub.name,
    clubNumber: dbClub.club_number || '',
    email: dbClub.email || '',
    phone: dbClub.phone || '',
    website: dbClub.website || undefined,
    description: dbClub.description || '',
    logo: dbClub.logo_url || '',
    coverImage: dbClub.cover_image_url || '',
    accentColor: dbClub.accent_color || '',
    address,
    upcomingShows,
    pastShows,

    // Sync metadata for Local-First architecture
    _version: 1,
    _lastModified: new Date(dbClub.updated_at || dbClub.created_at || new Date().toISOString()),
    _lastModifiedBy: 'system',
    _syncStatus: 'synced',
    _localOnly: false,
  };
};

/**
 * Maps array of DbClub to array of Club
 */
export const mapDatabaseClubsArray = (
  dbClubs: (DbClub & {
    show?: unknown[];
  })[]
): Club[] => {
  return dbClubs.map(mapDatabaseToClub);
};

/**
 * Maps Club (from Zustand store) back to ClubInput for form editing
 */
export const mapClubToClubInput = (club: Club): ClubInput => {
  return {
    name: club.name,
    clubNumber: club.clubNumber,
    email: club.email,
    phone: club.phone,
    website: club.website,
    description: club.description,
    logo: club.logo,
    street: club.address.street,
    city: club.address.city,
    state: club.address.state,
    zipCode: club.address.zipCode,
    country: club.address.country,
    founded: club.founded,
    clubType: club.clubType,
    memberIds: club.memberIds,
  };
};

/**
 * Maps Club object to DbClubUpdate for database persistence
 */
export const mapClubToUpdate = (club: Club): DbClubUpdate => {
  // Combine address fields into a single string for the database
  const fullAddress = `${club.address.street}, ${club.address.city}, ${club.address.state} ${club.address.zipCode}, ${club.address.country}`;

  return {
    name: club.name,
    email: club.email || null,
    phone: club.phone || null,
    website: club.website || null,
    description: club.description || null,
    logo_url: club.logo || null,
    cover_image_url: club.coverImage || null,
    accent_color: club.accentColor || null,
    address: fullAddress,
    city: club.address.city || null,
    state: club.address.state || null,
    zip_code: club.address.zipCode || null,
    club_number: club.clubNumber || null,
  };
};

/**
 * Utility function to safely parse JSON fields
 */
export const safeParseJson = <T>(jsonString: string | null | undefined, fallback: T): T => {
  if (!jsonString) return fallback;

  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    logger.warn('Failed to parse JSON:', 'mappers', {}, error as Error);
    return fallback;
  }
};

/**
 * Utility function to validate club data before mapping
 */
export const validateClubData = (club: Club | ClubInput): string[] => {
  const errors: string[] = [];

  if (!club.name?.trim()) {
    errors.push('Club name is required');
  }

  if (!club.email?.trim()) {
    errors.push('Club email is required');
  }

  if (club.email && !isValidEmail(club.email)) {
    errors.push('Valid email address is required');
  }

  if (!club.phone?.trim()) {
    errors.push('Club phone number is required');
  }

  if (!club.description?.trim()) {
    errors.push('Club description is required');
  }

  // Address validation
  if ('street' in club) {
    if (!club.street?.trim()) {
      errors.push('Street address is required');
    }
    if (!club.city?.trim()) {
      errors.push('City is required');
    }
    if (!club.state?.trim()) {
      errors.push('State is required');
    }
    if (!club.zipCode?.trim()) {
      errors.push('ZIP code is required');
    }
    if (!club.country?.trim()) {
      errors.push('Country is required');
    }
  } else {
    // For Club type with structured address
    if (!club.address?.street?.trim()) {
      errors.push('Street address is required');
    }
    if (!club.address?.city?.trim()) {
      errors.push('City is required');
    }
    if (!club.address?.state?.trim()) {
      errors.push('State is required');
    }
    if (!club.address?.zipCode?.trim()) {
      errors.push('ZIP code is required');
    }
    if (!club.address?.country?.trim()) {
      errors.push('Country is required');
    }
  }

  return errors;
};

/**
 * Create a default ClubInput for new club creation
 */
export const createDefaultClubInput = (): Partial<ClubInput> => {
  return {
    name: '',
    clubNumber: '',
    email: '',
    phone: '',
    website: '',
    description: '',
    logo: '',
    street: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'US',
    clubType: 'local',
    memberIds: [],
  };
};

/**
 * Utility function to validate email format
 */
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Utility function to format club display name
 */
export const formatClubDisplayName = (club: Club): string => {
  if (club.clubNumber) {
    return `${club.name} (${club.clubNumber})`;
  }
  return club.name;
};

/**
 * Utility function to format club address for display
 */
export const formatClubAddress = (address: ClubAddress): string => {
  const parts = [
    address.street,
    address.city,
    `${address.state} ${address.zipCode}`.trim(),
    address.country,
  ].filter(part => part && part.trim());

  return parts.join(', ');
};
