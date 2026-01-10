export interface ClubAddress {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface Club {
  id: string;
  name: string;
  clubNumber: string;
  email: string;
  phone: string;
  website?: string;
  description: string;
  logo: string;
  
  // Enhanced address structure
  address: ClubAddress;
  
  // Additional metadata
  founded?: Date;
  clubType?: 'specialty' | 'all-breed' | 'local' | 'regional' | 'national';
  
  // Membership data
  memberIds?: string[];  // Array of person IDs
  // Note: Club admins are now managed through RBAC system instead of clubAdminId
  
  // Show data
  upcomingShows: Array<{
    id: string;
    name: string;
    date: string;
    location: string;
    description: string;
  }>;
  pastShows: Array<{
    id: string;
    name: string;
    date: string;
    location: string;
    description: string;
  }>;

  // Sync metadata for Local-First architecture
  _version?: number;
  _lastModified?: Date;
  _lastModifiedBy?: string;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean;
}

export interface ClubInput {
  name: string;
  clubNumber: string;
  email: string;
  phone: string;
  website?: string;
  description: string;
  logo?: string;
  
  // Address fields
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  
  // Additional fields
  founded?: Date;
  clubType?: 'specialty' | 'all-breed' | 'local' | 'regional' | 'national';
  memberIds?: string[];
}

export interface ClubFormData {
  id: string;
  name: string;
  clubNumber: string;
  email: string;
  phone: string;
  website: string;
  description: string;
  logo: string;
  
  // Enhanced address fields
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  
  // Additional fields
  founded?: string; // ISO date string for forms
  clubType?: string;
}

export const CLUB_TYPES = [
  { value: 'specialty', label: 'Specialty Club' },
  { value: 'all-breed', label: 'All-Breed Club' },
  { value: 'local', label: 'Local Club' },
  { value: 'regional', label: 'Regional Club' },
  { value: 'national', label: 'National Club' }
] as const;

export const COUNTRIES = [
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
] as const;

export const DEFAULT_COUNTRY = 'US';
