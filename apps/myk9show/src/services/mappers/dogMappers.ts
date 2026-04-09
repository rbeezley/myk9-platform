// Type mapping utilities for Dog Store <-> Database integration
// Phase 2.1: Dog Store Integration

import { mapFields } from './mapperUtils';
import type { Dog, DogStatus } from '@/types/dog-types';
import type { DbDogInsert, DbDogUpdate } from '@/types/database-mappings';
import type { DogInput } from '@/store/dogStore';

/**
 * Health record row from the database (health_records table)
 */
interface DbHealthRecordRow {
  id: string;
  record_type: string;
  title: string;
  date: string;
  description?: string | null;
  vet_name?: string | null;
  vet_clinic?: string | null;
}

/**
 * Maps an array of health_records rows from the DB into the nested
 * healthRecords shape expected by the Dog domain type.
 *
 * The DB stores all health record types in a single table differentiated
 * by `record_type`. We split them into vaccinations / medications / allergies
 * based on that discriminator.
 */
function mapHealthRecords(raw: unknown): Dog['healthRecords'] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { vaccinations: [], medications: [], allergies: [] };
  }

  const rows = raw as DbHealthRecordRow[];

  const vaccinations = rows
    .filter(r => r.record_type === 'vaccination')
    .map(r => ({
      id: r.id,
      name: r.title,
      date: r.date,
      nextDue: undefined,
      veterinarian: r.vet_name || '',
    }));

  const medications = rows
    .filter(r => r.record_type === 'medication')
    .map(r => ({
      id: r.id,
      name: r.title,
      dosage: r.description || '',
      frequency: '',
      startDate: r.date,
      endDate: undefined,
    }));

  const allergies = rows
    .filter(r => r.record_type === 'allergy')
    .map(r => ({
      id: r.id,
      allergen: r.title,
      severity: '',
      reaction: r.description || '',
      notes: undefined,
    }));

  return { vaccinations, medications, allergies };
}

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
    spayed_neutered: input.spayedNeutered ?? null,
    deceased: input.status === 'deceased',
    deceased_date: input.deceasedDate || null,
    // Note: registrations and health records are handled in separate tables
    // Note: ID is explicitly omitted to allow database auto-generation
  };

  // status column added via migration 039 — not yet in generated Supabase types
  (dbInsert as Record<string, unknown>).status = input.status || 'active';

  // Defensive programming: Ensure no id field is accidentally included
  if ('id' in dbInsert) {
    delete (dbInsert as Record<string, unknown>)['id'];
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
  if (input.spayedNeutered !== undefined) update.spayed_neutered = input.spayedNeutered;
  if (input.status !== undefined) {
    (update as Record<string, unknown>).status = input.status;
    update.deceased = input.status === 'deceased';
    update.deceased_date = input.deceasedDate || null;
  }

  return update;
};

/**
 * Convert ReplicatedDog (camelCase, no joins) to the snake_case DB row shape
 * that mapDatabaseToDog / mapDatabaseDogsArray expects.
 *
 * Optionally attach an `owner` sub-object and `registrations` array when
 * the corresponding data is provided via `options`.
 */
export const mapReplicatedDogToDbRow = (
  d: {
    id: string;
    name: string;
    callName?: string | undefined;
    breed: string;
    sex?: string | undefined;
    dateOfBirth?: string | undefined;
    ownerId?: string | undefined;
    height?: string | undefined;
    weight?: string | undefined;
    color?: string | undefined;
    microchipNumber?: string | undefined;
    isSpayedNeutered?: boolean | undefined;
    imageUrl?: string | undefined;
  },
  options?: {
    owner?: Record<string, unknown> | null;
    registrations?: Record<string, unknown>[];
    entries?: Record<string, unknown>[];
    healthRecords?: Record<string, unknown>[];
  }
): Record<string, unknown> => {
  const row: Record<string, unknown> = {
    ...mapFields(d as unknown as Record<string, unknown>, {
      id: 'id',
      name: 'name',
      call_name: 'callName',
      breed: 'breed',
      sex: 'sex',
      date_of_birth: 'dateOfBirth',
      owner_id: 'ownerId',
      height: 'height',
      weight: 'weight',
      color: 'color',
      microchip_number: 'microchipNumber',
      spayed_neutered: 'isSpayedNeutered',
      image_url: 'imageUrl',
    }),
    co_owner_id: null,
    deleted_at: null,
    owner: options?.owner ?? null,
    registrations: options?.registrations ?? [],
  };

  if (options?.entries) {
    row.entries = options.entries;
  }
  if (options?.healthRecords) {
    row.health_records = options.healthRecords;
  }

  return row;
};

/**
 * Convert database dog result to Dog type (for backward compatibility)
 */
export const mapDatabaseToDog = (dbDog: Record<string, unknown>): Dog => {
  const sex = dbDog.sex as 'male' | 'female' | null;
  const dateOfBirth = dbDog.date_of_birth as string | null;

  return {
    id: dbDog.id as string,
    name: dbDog.name as string,
    callName: (dbDog.call_name as string) || (dbDog.name as string), // Use call_name if available, fallback to name
    breed: dbDog.breed as string,
    birthDate: dateOfBirth ?? undefined,
    dateOfBirth: dateOfBirth ?? undefined, // Also set dateOfBirth for backward compatibility
    sex: sex ?? 'male', // Default to male if not set (required field)
    gender: sex ? ((sex.charAt(0).toUpperCase() + sex.slice(1)) as 'Male' | 'Female') : undefined, // Also set gender for backward compatibility
    color: dbDog.color as string,
    weight: dbDog.weight ? String(dbDog.weight) : undefined,
    height: dbDog.height ? String(dbDog.height) : undefined,
    ownerId: dbDog.owner_id as string,
    ownerName: dbDog.owner
      ? `${(dbDog.owner as Record<string, unknown>).first_name} ${(dbDog.owner as Record<string, unknown>).last_name}`.trim()
      : '',
    microchipNumber: dbDog.microchip_number as string,
    imageUrl: (dbDog.image_url as string) || undefined,
    spayedNeutered: (dbDog.spayed_neutered as boolean) ?? undefined,
    status: (dbDog.status as string as DogStatus) || 'active',
    deceasedDate: (dbDog.deceased_date as string) || undefined,
    registrations: Array.isArray(dbDog.registrations)
      ? dbDog.registrations.map((reg: Record<string, unknown>) => ({
          id: reg.id as string,
          organization: (reg.organization as string) || '',
          registeredName: (reg.registered_name as string) || '',
          breed: (reg.breed as string) || (dbDog.breed as string),
          registrationNumber: (reg.registration_number as string) || '',
          status: (reg.status as string) || 'active',
        }))
      : [],
    healthRecords: mapHealthRecords(dbDog.health_records),
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
    imageUrl: dog.imageUrl,
    spayedNeutered: dog.spayedNeutered,
    status: dog.status,
    deceasedDate: dog.deceasedDate,
    registrations: dog.registrations?.map(reg => ({
      organization: reg.organization,
      number: reg.registrationNumber,
      type: reg.breed,
      status: reg.status,
    })),
    healthRecords: dog.healthRecords,
  };
};
