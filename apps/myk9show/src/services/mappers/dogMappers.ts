// Type mapping utilities for Dog Store <-> Database integration
// Phase 2.1: Dog Store Integration

import type { Dog } from '@/types/dog-types';
import type { DbDogInsert, DbDogUpdate } from '@/types/database-mappings';
import type { DogInput } from '@/store/dogStore';

/**
 * Convert DogInput (from dogStore) to DbDogInsert (for database)
 */
export const mapDogInputToInsert = (input: DogInput): DbDogInsert => {
  const dbInsert: DbDogInsert = {
    name: input.name,
    breed: input.breed,
    date_of_birth: input.birthDate || null,
    sex: input.sex,
    color: input.color || null,
    weight: input.weight ? String(input.weight) : null,
    height: input.height ? String(input.height) : null,
    owner_id: input.ownerId,
    microchip_number: input.microchipNumber || null,
    image_url: input.imageUrl || null,
    call_name: input.callName || null, // Use callName from input if provided
    // Note: registrations and health records are handled in separate tables
    // Note: ID is explicitly omitted to allow database auto-generation
  };
  
  // Defensive programming: Ensure no id field is accidentally included
  if ('id' in dbInsert) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (dbInsert as any).id;
  }
  
  return dbInsert;
};

/**
 * Convert DogInput updates to DbDogUpdate (for database)
 */
export const mapDogInputToUpdate = (input: Partial<DogInput>): DbDogUpdate => {
  const update: DbDogUpdate = {};

  if (input.name !== undefined) update.name = input.name;
  if (input.callName !== undefined) update.call_name = input.callName || null;
  if (input.breed !== undefined) update.breed = input.breed;
  if (input.birthDate !== undefined) update.date_of_birth = input.birthDate || null;
  if (input.sex !== undefined) update.sex = input.sex;
  if (input.color !== undefined) update.color = input.color || null;
  if (input.weight !== undefined) update.weight = input.weight ? String(input.weight) : null;
  if (input.height !== undefined) update.height = input.height ? String(input.height) : null;
  if (input.ownerId !== undefined) update.owner_id = input.ownerId;
  if (input.microchipNumber !== undefined) update.microchip_number = input.microchipNumber || null;
  if (input.imageUrl !== undefined) update.image_url = input.imageUrl || null;

  return update;
};

/**
 * Convert database dog result to Dog type (for backward compatibility)
 */
export const mapDatabaseToDog = (dbDog: Record<string, unknown>): Dog => {
  return {
    id: dbDog.id as string,
    name: dbDog.name as string,
    callName: (dbDog.call_name as string) || (dbDog.name as string), // Use call_name if available, fallback to name
    breed: dbDog.breed as string,
    birthDate: dbDog.date_of_birth as string,
    sex: dbDog.sex as 'male' | 'female',
    color: dbDog.color as string,
    weight: dbDog.weight ? String(dbDog.weight) : undefined,
    height: dbDog.height ? String(dbDog.height) : undefined,
    ownerId: dbDog.owner_id as string,
    ownerName: dbDog.owner ? 
      `${(dbDog.owner as Record<string, unknown>).first_name} ${(dbDog.owner as Record<string, unknown>).last_name}`.trim() : '',
    microchipNumber: dbDog.microchip_number as string,
    registrations: Array.isArray(dbDog.registrations) ? 
      dbDog.registrations.map((reg: Record<string, unknown>) => ({
        id: reg.id as string,
        organization: (reg.organization as string) || '',
        registeredName: (reg.registered_name as string) || '',
        breed: (reg.breed as string) || (dbDog.breed as string),
        registrationNumber: (reg.registration_number as string) || '',
        status: (reg.status as string) || 'active',
      })) : [],
    healthRecords: {
      vaccinations: ((dbDog.health_record as Record<string, unknown>)?.vaccinations as Array<{
        id: string;
        name: string;
        date: string;
        nextDue?: string;
        veterinarian: string;
      }>) || [],
      medications: ((dbDog.health_record as Record<string, unknown>)?.medications as Array<{
        id: string;
        name: string;
        dosage: string;
        frequency: string;
        startDate: string;
        endDate?: string;
      }>) || [],
      allergies: ((dbDog.health_record as Record<string, unknown>)?.allergies as Array<{
        id: string;
        allergen: string;
        severity: string;
        reaction: string;
        notes?: string;
      }>) || [],
    },
    // Sync metadata - no longer needed with React Query, but kept for compatibility
    _version: 1,
    _lastModified: new Date((dbDog.updated_at as string) || (dbDog.created_at as string)),
    _lastModifiedBy: 'database',
    _syncStatus: 'synced',
    _localOnly: false,
  };
};

/**
 * Convert array of database dogs to Dog array
 */
export const mapDatabaseDogsArray = (dbDogs: Record<string, unknown>[]): Dog[] => {
  return dbDogs.map(mapDatabaseToDog);
};

/**
 * Utility to create a DogInput from a Dog (for editing)
 */
export const mapDogToDogInput = (dog: Dog): DogInput => {
  return {
    name: dog.name,
    breed: dog.breed,
    birthDate: dog.birthDate,
    sex: dog.sex,
    color: dog.color,
    weight: dog.weight ? parseFloat(dog.weight) : undefined,
    height: dog.height ? parseFloat(dog.height) : undefined,
    ownerId: dog.ownerId,
    ownerName: dog.ownerName,
    microchipNumber: dog.microchipNumber,
    imageUrl: undefined, // Not currently stored in Dog type
    registrations: dog.registrations?.map(reg => ({
      organization: reg.organization,
      number: reg.registrationNumber,
      type: reg.breed,
      status: reg.status,
    })),
    healthRecords: dog.healthRecords,
  };
};