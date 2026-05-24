import { UserRole } from '@/types/auth-types';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  name?: string | undefined; // Full name (computed or stored)
  email?: string | undefined;
  phone?: string | undefined;
  address?: string | undefined;
  streetAddress?: string | undefined; // Alternative field name for address
  city?: string | undefined;
  state?: string | undefined;
  zipCode?: string | undefined;
  country?: string | undefined;
  dateOfBirth?: string | undefined;
  birthDate?: string | undefined; // Alias for dateOfBirth
  membershipId?: string | undefined;
  clubAffiliations?: string[] | undefined;
  roles?: UserRole[] | undefined;
  roleAssignments?:
    | {
        roleName: UserRole;
        clubId: string | null;
        showId: string | null;
        isActive: boolean;
      }[]
    | undefined;
  judgeInfo?: JudgeInfo | undefined;
  judgeQualifications?: JudgeQualification[] | undefined; // Alias for judgeInfo.qualifications
  emergencyContact?:
    | {
        name: string;
        phone: string;
        relationship: string;
        [key: string]: unknown; // Index signature for JSON compatibility
      }
    | undefined;
  profileImage?: string | undefined;
  dogs?: string[] | undefined; // Array of dog IDs for UI components
  associatedDogs?: string[] | undefined; // Array of dog IDs for Local-First sync
  user_id?: string | undefined; // Link to auth.users table for RBAC
  deletedAt?: string | undefined;
  deletedBy?: string | undefined;
  status?: 'active' | 'suspended' | undefined;

  // Sync metadata for Local-First architecture
  _version?: number | undefined;
  _lastModified?: Date | undefined;
  _lastModifiedBy?: string | undefined;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict' | undefined; // For internal sync tracking
  _localOnly?: boolean | undefined;

  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

export interface Handler extends User {
  handlerNumber?: string;
  experience?: string; // 'beginner' | 'intermediate' | 'advanced' | 'professional'
  certifications?: string[];
}

export interface JudgeQualification {
  // Core properties from both definitions
  organization: 'AKC' | 'UKC' | 'FCI' | 'NACSW' | 'CPE' | 'OTHER' | 'Other';
  level: string;
  disciplines: string[];
  dateObtained: Date | null;
  expirationDate: Date | null;

  // Additional properties from judge-types.ts
  judgeNumber: string;
  showTypes: string[]; // ['Scent Work', 'Agility', etc.]
  certificationDate: string;
  status: 'Active' | 'Suspended' | 'Expired';
}

export interface JudgeCertification {
  name: string;
  issuingBody: string;
  dateObtained: Date | null;
  expirationDate: Date | null;
  certificationNumber: string;
}

export interface JudgeInfo {
  judgeNumber: string;
  qualifications: JudgeQualification[];
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

export interface Judge extends User {
  judgeInfo: JudgeInfo;
}

export interface Exhibitor extends User {
  exhibitorNumber?: string;
  ownedDogs?: string[]; // Array of dog IDs
  preferredClasses?: string[];
}

// Re-export UserRole from auth-types for backward compatibility of imports
export { UserRole } from '@/types/auth-types';
