// Type mapping utilities for Registration Store <-> Database integration
// Phase 4.3: Registration System Integration

import type { Registration } from '@/types/dog-types';
import type { DbDogRegistration, DbDogRegistrationInsert, DbDogRegistrationUpdate } from '@/types/database-mappings';

// Registration input type for creating/updating registrations
export interface RegistrationInput {
  dogId: string;
  organization: string;
  registeredName: string;
  breed: string;
  variety?: string;
  registrationNumber?: string;
  status: string;
  applicationNumber?: string;
  submissionDate?: string;
  registrationDate?: string;
  certificate?: string;
}

/**
 * Convert RegistrationInput to DbDogRegistrationInsert (for database)
 */
export const mapRegistrationInputToInsert = (input: RegistrationInput): DbDogRegistrationInsert => {
  return {
    dog_id: input.dogId,
    organization: input.organization,
    registered_name: input.registeredName,
    breed: input.breed,
    variety: input.variety || null,
    registration_number: input.registrationNumber || null,
    status: input.status || 'pending',
    application_number: input.applicationNumber || null,
    submission_date: input.submissionDate || null,
    registration_date: input.registrationDate || null,
    certificate: input.certificate || null,
  };
};

/**
 * Convert RegistrationInput updates to DbDogRegistrationUpdate (for database)
 */
export const mapRegistrationInputToUpdate = (input: Partial<RegistrationInput>): DbDogRegistrationUpdate => {
  const update: DbDogRegistrationUpdate = {};

  if (input.dogId !== undefined) update.dog_id = input.dogId;
  if (input.organization !== undefined) update.organization = input.organization;
  if (input.registeredName !== undefined) update.registered_name = input.registeredName;
  if (input.breed !== undefined) update.breed = input.breed;
  if (input.variety !== undefined) update.variety = input.variety || null;
  if (input.registrationNumber !== undefined) update.registration_number = input.registrationNumber || null;
  if (input.status !== undefined) update.status = input.status;
  if (input.applicationNumber !== undefined) update.application_number = input.applicationNumber || null;
  if (input.submissionDate !== undefined) update.submission_date = input.submissionDate || null;
  if (input.registrationDate !== undefined) update.registration_date = input.registrationDate || null;
  if (input.certificate !== undefined) update.certificate = input.certificate || null;

  return update;
};

/**
 * Convert database registration result to Registration type (for backward compatibility)
 */
export const mapDatabaseToRegistration = (dbRegistration: DbDogRegistration | Record<string, unknown>): Registration => {
  return {
    id: dbRegistration.id as string,
    organization: (dbRegistration.organization as string) || '',
    registeredName: (dbRegistration.registered_name as string) || '',
    breed: (dbRegistration.breed as string) || '',
    variety: (dbRegistration.variety as string) || undefined,
    registrationNumber: (dbRegistration.registration_number as string) || '',
    status: (dbRegistration.status as string) || 'pending',
    applicationNumber: (dbRegistration.application_number as string) || undefined,
    submissionDate: (dbRegistration.submission_date as string) || undefined,
    registrationDate: (dbRegistration.registration_date as string) || undefined,
    certificate: (dbRegistration.certificate as string) || undefined,
  };
};

/**
 * Convert array of database registrations to Registration array
 */
export const mapDatabaseRegistrationsArray = (dbRegistrations: (DbDogRegistration | Record<string, unknown>)[]): Registration[] => {
  return dbRegistrations.map(mapDatabaseToRegistration);
};

/**
 * Utility to create a RegistrationInput from a Registration (for editing)
 */
export const mapRegistrationToRegistrationInput = (registration: Registration, dogId: string): RegistrationInput => {
  return {
    dogId,
    organization: registration.organization,
    registeredName: registration.registeredName,
    breed: registration.breed,
    variety: registration.variety,
    registrationNumber: registration.registrationNumber,
    status: registration.status,
    applicationNumber: registration.applicationNumber,
    submissionDate: registration.submissionDate,
    registrationDate: registration.registrationDate,
    certificate: registration.certificate,
  };
};

/**
 * Enhanced registration type with dog information (for full details)
 */
export interface RegistrationWithDog extends Registration {
  dog?: {
    id: string;
    name: string;
    callName?: string;
    breed: string;
    sex: string;
    dateOfBirth?: string;
    color?: string;
    microchipNumber?: string;
    owner?: {
      id: string;
      firstName: string;
      lastName: string;
      email?: string;
      phone?: string;
      address?: string;
      city?: string;
      state?: string;
      postalCode?: string;
    };
  };
}

/**
 * Convert database registration with dog details to enhanced type
 */
export const mapDatabaseToRegistrationWithDog = (dbResult: Record<string, unknown>): RegistrationWithDog => {
  const registration = mapDatabaseToRegistration(dbResult);
  
  // Map dog information if available
  const dogData = dbResult.dog as Record<string, unknown> | undefined;
  const dog = dogData ? {
    id: dogData.id as string,
    name: (dogData.name as string) || '',
    callName: (dogData.call_name as string) || undefined,
    breed: (dogData.breed as string) || '',
    sex: (dogData.sex as string) || '',
    dateOfBirth: (dogData.date_of_birth as string) || undefined,
    color: (dogData.color as string) || undefined,
    microchipNumber: (dogData.microchip_number as string) || undefined,
    owner: dogData.owner ? {
      id: (dogData.owner as Record<string, unknown>).id as string,
      firstName: ((dogData.owner as Record<string, unknown>).first_name as string) || '',
      lastName: ((dogData.owner as Record<string, unknown>).last_name as string) || '',
      email: ((dogData.owner as Record<string, unknown>).email as string) || undefined,
      phone: ((dogData.owner as Record<string, unknown>).phone as string) || undefined,
      address: ((dogData.owner as Record<string, unknown>).address as string) || undefined,
      city: ((dogData.owner as Record<string, unknown>).city as string) || undefined,
      state: ((dogData.owner as Record<string, unknown>).state as string) || undefined,
      postalCode: ((dogData.owner as Record<string, unknown>).postal_code as string) || undefined,
    } : undefined,
  } : undefined;

  return {
    ...registration,
    dog,
  };
};

/**
 * Convert array of database results with dog details to enhanced registration array
 */
export const mapDatabaseToRegistrationWithDogArray = (dbResults: Record<string, unknown>[]): RegistrationWithDog[] => {
  return dbResults.map(mapDatabaseToRegistrationWithDog);
};

/**
 * Validate registration data before save
 */
export const validateRegistrationData = (input: RegistrationInput): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  // Required fields validation
  if (!input.dogId || input.dogId.trim() === '') {
    errors.push('Dog ID is required');
  }

  if (!input.organization || input.organization.trim() === '') {
    errors.push('Organization is required');
  }

  if (!input.registeredName || input.registeredName.trim() === '') {
    errors.push('Registered name is required');
  }

  if (!input.breed || input.breed.trim() === '') {
    errors.push('Breed is required');
  }

  if (!input.status || input.status.trim() === '') {
    errors.push('Status is required');
  }

  // Valid status values
  const validStatuses = ['pending', 'approved', 'expired', 'suspended', 'rejected', 'under review'];
  if (input.status && !validStatuses.includes(input.status.toLowerCase())) {
    errors.push('Invalid status value');
  }

  // Date validation
  if (input.submissionDate && !isValidDate(input.submissionDate)) {
    errors.push('Invalid submission date format');
  }

  if (input.registrationDate && !isValidDate(input.registrationDate)) {
    errors.push('Invalid registration date format');
  }

  // Registration number format validation (if provided)
  if (input.registrationNumber && input.organization) {
    const isValidFormat = validateRegistrationNumberFormat(input.organization, input.registrationNumber);
    if (!isValidFormat) {
      errors.push(`Invalid registration number format for ${input.organization}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Helper function to validate date format
 */
const isValidDate = (dateString: string): boolean => {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
};

/**
 * Helper function to validate registration number format by organization
 */
const validateRegistrationNumberFormat = (organization: string, registrationNumber: string): boolean => {
  if (!registrationNumber || registrationNumber.trim() === '') {
    return false;
  }

  const cleanNumber = registrationNumber.trim().toUpperCase();

  switch (organization.toUpperCase()) {
    case 'AKC':
      // AKC format: letters followed by numbers (e.g., SS12345678, WS65432109)
      return /^[A-Z]{2}\d{8}$/.test(cleanNumber);
      
    case 'UKC':
      // UKC format: typically alphanumeric (e.g., A123456, AB123456)
      return /^[A-Z]{1,2}\d{6,}$/.test(cleanNumber);
      
    case 'CKC':
      // CKC format: letters and numbers (e.g., AB123456, ABC123456)
      return /^[A-Z]{2,3}\d{6,}$/.test(cleanNumber);
      
    case 'FCI':
      // FCI format: country code + numbers (e.g., USA123456789)
      return /^[A-Z]{3}\d{6,}$/.test(cleanNumber);
      
    default:
      // For other organizations, just check it's not empty and has reasonable length
      return cleanNumber.length >= 4 && cleanNumber.length <= 20;
  }
};

/**
 * Get registration status display information
 */
export const getRegistrationStatusInfo = (status: string) => {
  const statusMap = {
    pending: { label: 'Pending', color: 'orange', description: 'Application submitted, awaiting review' },
    approved: { label: 'Approved', color: 'green', description: 'Registration approved and active' },
    expired: { label: 'Expired', color: 'red', description: 'Registration has expired' },
    suspended: { label: 'Suspended', color: 'red', description: 'Registration suspended' },
    rejected: { label: 'Rejected', color: 'red', description: 'Application rejected' },
    'under review': { label: 'Under Review', color: 'blue', description: 'Currently being reviewed' },
  };

  return statusMap[status.toLowerCase() as keyof typeof statusMap] || {
    label: status,
    color: 'gray',
    description: 'Unknown status',
  };
};

/**
 * Get organization display information
 */
export const getOrganizationInfo = (organization: string) => {
  const orgMap = {
    AKC: { 
      fullName: 'American Kennel Club', 
      country: 'USA',
      website: 'https://www.akc.org',
      registrationPattern: 'XX########'
    },
    UKC: { 
      fullName: 'United Kennel Club', 
      country: 'USA',
      website: 'https://www.ukcdogs.com',
      registrationPattern: 'X######+'
    },
    CKC: { 
      fullName: 'Canadian Kennel Club', 
      country: 'Canada',
      website: 'https://www.ckc.ca',
      registrationPattern: 'XX######+'
    },
    FCI: { 
      fullName: 'Fédération Cynologique Internationale', 
      country: 'International',
      website: 'https://www.fci.be',
      registrationPattern: 'XXX######+'
    },
  };

  return orgMap[organization.toUpperCase() as keyof typeof orgMap] || {
    fullName: organization,
    country: 'Unknown',
    website: '',
    registrationPattern: 'Varies',
  };
};