// Type mapping utilities for User Store <-> Database integration
// Phase 2.2: User Store Integration

import type { User, JudgeInfo } from '@/types/user-types';
import { UserRole } from '@/types/auth-types';
import type { DbUserInsert, DbUserUpdate, DbJudgeAvailability } from '@/types/database-mappings';
import type { UserInput } from '@/store/userStore';
import { toYYYYMMDD } from '@/utils/dateFormat';

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

  // Roles are managed via user_roles table, not the people table column
  // (people.roles column was dropped in migration 066)

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
    profileImage: dbUser.profile_image as string,
    user_id: dbUser.auth_user_id as string, // Link to auth.users for RBAC

    // Map associated dogs if included in query
    dogs: Array.isArray(dbUser.dog)
      ? (dbUser.dog as Array<Record<string, unknown>>).map(dog => dog.id as string)
      : [],

    associatedDogs: Array.isArray(dbUser.dog)
      ? (dbUser.dog as Array<Record<string, unknown>>).map(dog => dog.id as string)
      : [],

    // Roles are managed via user_roles table, not the people table
    roles: [],

    // Judge qualifications - handle if present (from nested select)
    judgeQualifications: Array.isArray(dbUser.judge_qualifications)
      ? (dbUser.judge_qualifications as Array<Record<string, unknown>>).map(qual => ({
          judgeNumber: (dbUser.judge_number as string) || '',
          organization: (qual.organization as 'AKC' | 'UKC' | 'NACSW' | 'CPE' | 'OTHER') || 'OTHER',
          showTypes: (qual.disciplines as string[]) || [],
          certificationDate: (qual.date_obtained as string) || '',
          status: qual.is_active
            ? ('Active' as const)
            : qual.suspension_date
              ? ('Suspended' as const)
              : ('Expired' as const),
          level: (qual.qualification_level as string) || 'Regular',
          disciplines: (qual.disciplines as string[]) || [],
          dateObtained: qual.date_obtained ? new Date(qual.date_obtained as string) : null,
          expirationDate: qual.expiration_date ? new Date(qual.expiration_date as string) : null,
        }))
      : [],

    // Judge info - build from judge_number column + related tables
    judgeInfo: dbUser.judge_number
      ? {
          judgeNumber: dbUser.judge_number as string,
          qualifications: Array.isArray(dbUser.judge_qualifications)
            ? (dbUser.judge_qualifications as Array<Record<string, unknown>>).map(qual => ({
                judgeNumber: (dbUser.judge_number as string) || '',
                organization:
                  (qual.organization as 'AKC' | 'UKC' | 'NACSW' | 'CPE' | 'OTHER') || 'OTHER',
                showTypes: (qual.disciplines as string[]) || [],
                certificationDate: (qual.date_obtained as string) || '',
                status: qual.is_active
                  ? ('Active' as const)
                  : qual.suspension_date
                    ? ('Suspended' as const)
                    : ('Expired' as const),
                level: (qual.qualification_level as string) || 'Regular',
                disciplines: (qual.disciplines as string[]) || [],
                dateObtained: qual.date_obtained ? new Date(qual.date_obtained as string) : null,
                expirationDate: qual.expiration_date
                  ? new Date(qual.expiration_date as string)
                  : null,
              }))
            : [],
          certifications: Array.isArray(dbUser.judge_certifications)
            ? (dbUser.judge_certifications as Array<Record<string, unknown>>).map(cert => ({
                name: (cert.sport as string) || '',
                issuingBody: (cert.organization as string) || '',
                dateObtained: cert.certification_date
                  ? new Date(cert.certification_date as string)
                  : null,
                expirationDate: cert.expiration_date
                  ? new Date(cert.expiration_date as string)
                  : null,
                certificationNumber: (cert.certification_number as string) || '',
              }))
            : [],
          availability: {
            startDate: null,
            endDate: null,
            blackoutDates: [],
            maxShowsPerMonth: 0,
            travelRadius: 0,
          },
        }
      : undefined,

    // Sync metadata - maintained for compatibility
    _version: 1,
    _lastModified: new Date((dbUser.updated_at as string) || (dbUser.created_at as string)),
    _lastModifiedBy: 'database',
    _syncStatus: 'synced',
    _localOnly: false,
  };
};

/**
 * Convert DB availability row to UI availability shape
 */
export const mapDbAvailabilityToUI = (db: DbJudgeAvailability): JudgeInfo['availability'] => ({
  startDate: db.start_date ? new Date(db.start_date) : null,
  endDate: db.end_date ? new Date(db.end_date) : null,
  blackoutDates: (db.blackout_dates || []).map((d: string) => new Date(d)),
  maxShowsPerMonth: db.max_shows_per_month ?? 0,
  travelRadius: db.travel_radius_miles ?? 0,
});

/**
 * Convert UI availability to DB upsert payload
 */
export const mapUIAvailabilityToDb = (
  personId: string,
  availability: JudgeInfo['availability'],
  status?: 'available' | 'busy' | 'unavailable'
) => ({
  person_id: personId,
  start_date: availability.startDate ? toYYYYMMDD(new Date(availability.startDate)) : null,
  end_date: availability.endDate ? toYYYYMMDD(new Date(availability.endDate)) : null,
  max_shows_per_month: availability.maxShowsPerMonth,
  travel_radius_miles: availability.travelRadius,
  availability_status: status || 'available',
  blackout_dates: (availability.blackoutDates || []).map(d => toYYYYMMDD(new Date(d))),
});

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
  // Build address object conditionally to avoid undefined values with exactOptionalPropertyTypes
  const address: UserInput['address'] = {};
  const streetValue = user.streetAddress || user.address;
  if (streetValue) address.street = streetValue;
  if (user.city) address.city = user.city;
  if (user.state) address.state = user.state;
  if (user.zipCode) address.zipCode = user.zipCode;

  // Build result with only defined optional properties
  const result: UserInput = {
    firstName: user.firstName,
    lastName: user.lastName,
    address,
  };
  if (user.email !== undefined) result.email = user.email;
  if (user.phone !== undefined) result.phone = user.phone;
  if (user.dogs !== undefined) result.dogs = user.dogs;
  // Emergency contact handling can be added if needed

  return result;
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
  roles: [], // Roles managed via user_roles table
});
