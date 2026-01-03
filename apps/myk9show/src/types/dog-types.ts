// Re-export User type for components that import from dog-types
export type { User, UserRole, JudgeQualification } from './user-types';

// Judge-specific information
export interface JudgeInfo {
  judgeNumber: string;
  qualifications: JudgeQualificationDetailed[];
  certifications: JudgeCertification[];
  availability: {
    startDate: Date | null;
    endDate: Date | null;
    blackoutDates: Date[];
    maxShowsPerMonth: number;
    travelRadius: number;
  };
  availabilityStatus?: 'available' | 'busy' | 'unavailable';
  [key: string]: unknown; // Index signature for JSON compatibility
}

export interface JudgeQualificationDetailed {
  organization: 'AKC' | 'UKC' | 'FCI' | 'Other';
  level: string;
  disciplines: string[];
  dateObtained: Date | null;
  expirationDate: Date | null;
}

export interface JudgeCertification {
  name: string;
  issuingBody: string;
  dateObtained: Date | null;
  expirationDate: Date | null;
  certificationNumber: string;
}

/**
 * Represents a dog's registration with a kennel club or organization.
 * Contains all official registration information and status.
 * 
 * @example
 * ```typescript
 * const akcRegistration: Registration = {
 *   id: 'reg-123',
 *   organization: 'AKC',
 *   registeredName: 'Champion Goldenworth Max',
 *   breed: 'Golden Retriever',
 *   variety: 'Standard',
 *   registrationNumber: 'SS12345678',
 *   status: 'Active',
 *   registrationDate: '2023-01-15'
 * };
 * ```
 */
export interface Registration {
  id: string;
  organization: string;
  registeredName: string;
  breed: string;
  variety?: string;
  registrationNumber: string;
  status: 'Active' | 'Expired' | 'Pending' | 'Under review' | string;
  applicationNumber?: string;
  submissionDate?: string;
  registrationDate?: string;
  certificate?: string;
}

/**
 * Represents a dog owner with contact information.
 * Used for associating dogs with their owners and communication.
 * 
 * @example
 * ```typescript
 * const owner: Owner = {
 *   id: 'owner-456',
 *   name: 'John Smith',
 *   email: 'john.smith@email.com',
 *   phone: '+1-555-123-4567',
 *   profileImage: 'https://example.com/avatar.jpg'
 * };
 * ```
 */
export interface Owner {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  profileImage?: string;
}

/**
 * Core dog entity representing a dog in the show management system.
 * Contains all essential information including registration, health, and competition data.
 * 
 * @example
 * ```typescript
 * const dog: Dog = {
 *   id: 'dog-789',
 *   name: 'Champion Goldenworth Max',
 *   callName: 'Max',
 *   breed: 'Golden Retriever',
 *   sex: 'male',
 *   dateOfBirth: '2020-03-15',
 *   ownerId: 'owner-456',
 *   ownerName: 'John Smith',
 *   registrations: [{
 *     id: 'reg-123',
 *     organization: 'AKC',
 *     registeredName: 'Champion Goldenworth Max',
 *     breed: 'Golden Retriever',
 *     registrationNumber: 'SS12345678',
 *     status: 'Active'
 *   }],
 *   height: '24 inches',
 *   weight: '70 lbs',
 *   color: 'Golden',
 *   microchipNumber: '123456789012345',
 *   healthRecords: {
 *     vaccinations: [...],
 *     vetVisits: [...]
 *   }
 * };
 * ```
 */
export interface Dog {
  id: string;
  name: string; // Official or registered name
  breed: string; // Required field
  sex: 'male' | 'female'; // Required field
  age?: number; // Or consider dateOfBirth for more precision
  ownerId: string; // Owner ID
  ownerName?: string; // Owner name for easier display
  owner?: Owner; // Owner object (can be populated later)
  description?: string;
  // Fields from LegacyDog
  callName?: string; // Added from LegacyDog
  height?: string;
  weight?: string;
  gender?: 'Male' | 'Female' | ''; // Added from LegacyDog, made optional for flexibility
  dateOfBirth?: string;
  birthDate?: string; // Alternative naming
  imageUrl?: string;
  registrations?: Registration[]; // Added from LegacyDog, made optional
  color?: string;
  microchip?: string;
  spayedNeutered?: boolean;
  microchipNumber?: string; // Alternative naming
  deletedAt?: string;
  deletedBy?: string;

  // Health records
  healthRecords?: {
    vaccinations?: Array<{
      id: string;
      name: string;
      date: string;
      nextDue?: string;
      veterinarian: string;
    }>;
    medications?: Array<{
      id: string;
      name: string;
      dosage: string;
      frequency: string;
      startDate: string;
      endDate?: string;
    }>;
    allergies?: Array<{
      id: string;
      allergen: string;
      severity: string;
      reaction: string;
      notes?: string;
    }>;
  };

  // Competition data
  currentLevel?: string;
  measurements?: {
    height?: number;
    weight?: number;
    measuredAt?: string;
    measuredBy?: string;
  };

  // Sync metadata for Local-First architecture
  _version?: number;
  _lastModified?: Date;
  _lastModifiedBy?: string;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean;
}


// User interface now imported from user-types.ts

// Input types for creating/updating
export interface DogInput {
  name: string;
  callName?: string; // Optional call name (nickname)
  breed: string;
  sex: 'male' | 'female';
  birthDate?: string;
  color?: string;
  weight?: number;
  height?: number;
  ownerId: string;
  ownerName?: string;
  microchipNumber?: string;
  imageUrl?: string;
  registrations?: Array<{
    organization: string;
    number: string;
    type: string;
    status: string;
  }>;
  healthRecords?: {
    vaccinations?: Array<{
      id: string;
      name: string;
      date: string;
      nextDue?: string;
      veterinarian: string;
    }>;
    medications?: Array<{
      id: string;
      name: string;
      dosage: string;
      frequency: string;
      startDate: string;
      endDate?: string;
    }>;
    allergies?: Array<{
      id: string;
      allergen: string;
      severity: string;
      reaction: string;
      notes?: string;
    }>;
  };
}

export interface PersonInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  profileImage?: string;
  associatedDogs?: string[];
  dogs?: Dog[];
}
