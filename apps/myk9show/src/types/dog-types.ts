// Re-export User type for components that import from dog-types
export type { User, UserRole, JudgeQualification } from './user-types';

export type DogStatus = 'active' | 'retired' | 'deceased';

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
  email?: string | undefined;
  phone?: string | undefined;
  profileImage?: string | undefined;
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
  age?: number | undefined; // Or consider dateOfBirth for more precision
  ownerId: string; // Owner ID
  ownerName?: string | undefined; // Owner name for easier display
  owner?: Owner | undefined; // Owner object (can be populated later)
  description?: string | undefined;
  // Fields from LegacyDog
  callName?: string | undefined; // Added from LegacyDog
  height?: string | undefined;
  weight?: string | undefined;
  gender?: 'Male' | 'Female' | '' | undefined; // Added from LegacyDog, made optional for flexibility
  dateOfBirth?: string | undefined;
  birthDate?: string | undefined; // Alternative naming
  imageUrl?: string | undefined;
  registrations?: Registration[] | undefined; // Added from LegacyDog, made optional
  color?: string | undefined;
  microchip?: string | undefined;
  spayedNeutered?: boolean | undefined;
  microchipNumber?: string | undefined; // Alternative naming
  deletedAt?: string | undefined;
  deletedBy?: string | undefined;

  // Lifecycle status
  status?: DogStatus | undefined;
  deceasedDate?: string | undefined;

  // Health records
  healthRecords?:
    | {
        vaccinations?:
          | Array<{
              id: string;
              name: string;
              date: string;
              nextDue?: string | undefined;
              veterinarian: string;
            }>
          | undefined;
        medications?:
          | Array<{
              id: string;
              name: string;
              dosage: string;
              frequency: string;
              startDate: string;
              endDate?: string | undefined;
            }>
          | undefined;
        allergies?:
          | Array<{
              id: string;
              allergen: string;
              severity: string;
              reaction: string;
              notes?: string | undefined;
            }>
          | undefined;
      }
    | undefined;

  // Competition data
  currentLevel?: string | undefined;
  measurements?:
    | {
        height?: number | undefined;
        weight?: number | undefined;
        measuredAt?: string | undefined;
        measuredBy?: string | undefined;
      }
    | undefined;

  // Sync metadata for Local-First architecture
  _version?: number | undefined;
  _lastModified?: Date | undefined;
  _lastModifiedBy?: string | undefined;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict' | undefined;
  _localOnly?: boolean | undefined;
}

// User interface now imported from user-types.ts

// Input types for creating/updating
export interface DogInput {
  name: string;
  callName?: string | undefined; // Optional call name (nickname)
  breed: string;
  sex: 'male' | 'female';
  birthDate?: string | undefined;
  color?: string | undefined;
  weight?: number | undefined;
  height?: number | undefined;
  ownerId: string;
  ownerName?: string | undefined;
  microchipNumber?: string | undefined;
  imageUrl?: string | undefined;
  spayedNeutered?: boolean | undefined;
  status?: DogStatus | undefined;
  deceasedDate?: string | undefined;
  registrations?:
    | Array<{
        organization: string;
        number: string;
        type: string;
        status: string;
      }>
    | undefined;
  healthRecords?:
    | {
        vaccinations?:
          | Array<{
              id: string;
              name: string;
              date: string;
              nextDue?: string | undefined;
              veterinarian: string;
            }>
          | undefined;
        medications?:
          | Array<{
              id: string;
              name: string;
              dosage: string;
              frequency: string;
              startDate: string;
              endDate?: string | undefined;
            }>
          | undefined;
        allergies?:
          | Array<{
              id: string;
              allergen: string;
              severity: string;
              reaction: string;
              notes?: string | undefined;
            }>
          | undefined;
      }
    | undefined;
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
