// Type mapping utilities for User Store <-> Database integration
// Phase 2.2: User Store Integration

import type { User } from '@/types/user-types';
import type { DbUserInsert, DbUserUpdate } from '@/types/database-mappings';
import type { UserInput } from '@/store/userStore';

/**
 * Convert UserInput (from userStore) to DbUserInsert (for database)
 */
export const mapUserInputToInsert = (input: UserInput): DbUserInsert => {
  return {
    first_name: input.firstName,
    last_name: input.lastName,
    email: input.email || null,
    phone: input.phone || null,
    street_address: input.address?.street || null,
    city: input.address?.city || null,
    state: input.address?.state || null,
    zip_code: input.address?.zipCode || null,
    // Note: associated_dogs will be handled through the dog table's owner_id relationship
    // emergency_contact will be handled as JSON if needed or separate table
  };
};

/**
 * Convert UserInput updates to DbUserUpdate (for database)
 */
export const mapUserInputToUpdate = (input: Partial<UserInput>): DbUserUpdate => {
  const update: DbUserUpdate = {};

  if (input.firstName !== undefined) update.first_name = input.firstName;
  if (input.lastName !== undefined) update.last_name = input.lastName;
  if (input.email !== undefined) update.email = input.email || null;
  if (input.phone !== undefined) update.phone = input.phone || null;
  
  // Handle address updates
  if (input.address) {
    if (input.address.street !== undefined) update.street_address = input.address.street || null;
    if (input.address.city !== undefined) update.city = input.address.city || null;
    if (input.address.state !== undefined) update.state = input.address.state || null;
    if (input.address.zipCode !== undefined) update.zip_code = input.address.zipCode || null;
  }

  return update;
};

/**
 * Convert database user result to User type (for backward compatibility)
 */
export const mapDatabaseToUser = (dbUser: Record<string, unknown>): User => {
  return {
    id: dbUser.id as string,
    firstName: dbUser.first_name as string,
    lastName: dbUser.last_name as string,
    name: `${dbUser.first_name} ${dbUser.last_name}`.trim(),
    email: dbUser.email as string,
    phone: dbUser.phone as string,
    streetAddress: dbUser.street_address as string,
    address: dbUser.street_address as string, // Alternative field name
    city: dbUser.city as string,
    state: dbUser.state as string,
    zipCode: dbUser.zip_code as string,
    profileImage: dbUser.profile_image_url as string,
    user_id: dbUser.user_id as string, // Link to auth.users for RBAC
    
    // Map associated dogs if included in query
    dogs: Array.isArray(dbUser.dog) ? 
      (dbUser.dog as Array<Record<string, unknown>>).map(dog => dog.id as string) : [],
    
    associatedDogs: Array.isArray(dbUser.dog) ? 
      (dbUser.dog as Array<Record<string, unknown>>).map(dog => dog.id as string) : [],
    
    // Map roles from the RBAC system if available
    roles: Array.isArray(dbUser.roles) ? 
      dbUser.roles as Array<'exhibitor' | 'handler' | 'judge' | 'secretary' | 'steward' | 'admin'> : [],
    
    // Judge qualifications - handle if present
    judgeQualifications: Array.isArray(dbUser.judge_qualifications) ?
      (dbUser.judge_qualifications as Array<Record<string, unknown>>).map(qual => ({
        judgeNumber: qual.judge_number as string || '',
        organization: qual.organization as 'AKC' | 'UKC' | 'NACSW' | 'CPE' | 'OTHER' || 'OTHER',
        showTypes: (qual.show_types as string[]) || [],
        certificationDate: qual.certification_date as string || '',
        status: qual.status as 'Active' | 'Suspended' | 'Expired' || 'Active',
        level: qual.level as string || 'Apprentice',
        disciplines: (qual.disciplines as string[]) || (qual.show_types as string[]) || [],
        dateObtained: qual.date_obtained ? new Date(qual.date_obtained as string) : new Date(qual.certification_date as string || new Date()),
        expirationDate: qual.expiration_date ? new Date(qual.expiration_date as string) : null,
      })) : [],
    
    // Judge info - handle if present
    judgeInfo: dbUser.judge_info ? {
      judgeNumber: (dbUser.judge_info as Record<string, unknown>).judge_number as string,
      qualifications: [],
      certifications: [],
      availability: {
        startDate: null,
        endDate: null,
        blackoutDates: [],
        maxShowsPerMonth: 0,
        travelRadius: 0,
      },
    } : undefined,
    
    // Sync metadata - maintained for compatibility
    _version: 1,
    _lastModified: new Date((dbUser.updated_at as string) || (dbUser.created_at as string)),
    _lastModifiedBy: 'database',
    _syncStatus: 'synced',
    _localOnly: false,
  };
};

/**
 * Convert array of database users to User array
 */
export const mapDatabaseUsersArray = (dbUsers: Record<string, unknown>[]): User[] => {
  return dbUsers.map(mapDatabaseToUser);
};

/**
 * Utility to create a UserInput from a User (for editing)
 */
export const mapUserToUserInput = (user: User): UserInput => {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    address: {
      street: user.streetAddress || user.address,
      city: user.city,
      state: user.state,
      zipCode: user.zipCode,
    },
    dogs: user.dogs,
    // Emergency contact handling can be added if needed
  };
};

/**
 * Helper to extract user's full name from database result
 */
export const getUserFullName = (dbUser: Record<string, unknown>): string => {
  return `${dbUser.first_name || ''} ${dbUser.last_name || ''}`.trim();
};

/**
 * Helper to create user search filters
 */
export const createUserSearchFilters = (searchTerm: string): string => {
  return `first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`;
};

/**
 * Map user for display in lists (minimal data)
 */
export const mapUserForList = (dbUser: Record<string, unknown>) => ({
  id: dbUser.id as string,
  name: getUserFullName(dbUser),
  email: dbUser.email as string,
  phone: dbUser.phone as string,
  dogCount: Array.isArray(dbUser.dog) ? (dbUser.dog as Array<unknown>).length : 0,
  roles: Array.isArray(dbUser.roles) ? dbUser.roles as string[] : [],
});