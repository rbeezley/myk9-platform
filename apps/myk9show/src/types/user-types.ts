export interface User {
  id: string;
  firstName: string;
  lastName: string;
  name?: string; // Full name (computed or stored)
  email?: string;
  phone?: string;
  address?: string;
  streetAddress?: string; // Alternative field name for address
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  dateOfBirth?: string;
  birthDate?: string; // Alias for dateOfBirth
  membershipId?: string;
  clubAffiliations?: string[];
  roles?: UserRole[];
  judgeInfo?: JudgeInfo;
  judgeQualifications?: JudgeQualification[]; // Alias for judgeInfo.qualifications
  emergencyContact?: {
    name: string;
    phone: string;
    relationship: string;
    [key: string]: unknown; // Index signature for JSON compatibility
  };
  profileImage?: string;
  dogs?: string[]; // Array of dog IDs for UI components
  associatedDogs?: string[]; // Array of dog IDs for Local-First sync
  user_id?: string; // Link to auth.users table for RBAC
  deletedAt?: string;
  deletedBy?: string;

  // Sync metadata for Local-First architecture
  _version?: number;
  _lastModified?: Date;
  _lastModifiedBy?: string;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict'; // For internal sync tracking
  _localOnly?: boolean;
  
  createdAt?: Date;
  updatedAt?: Date;
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

export type UserRole = 'exhibitor' | 'handler' | 'judge' | 'secretary' | 'steward' | 'admin';