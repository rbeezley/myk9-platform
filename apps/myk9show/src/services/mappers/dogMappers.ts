// Type mapping utilities for Dog Store <-> Database integration
// Phase 2.1: Dog Store Integration

import { mapFields } from './mapperUtils';
import type { Dog, DogStatus } from '@/types/dog-types';
import type { DbDogInsert, DbDogUpdate } from '@/types/database-mappings';
import type { DogInput } from '@/store/dogStore';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import { resolveDogIdentity, type DogRegistrationLike } from '@/features/dogs/identity';
// The rules that decide what a value MEANS on the way to storage live above
// every mapper, in one module, so two mappers cannot state them differently.
import {
  DEFAULT_DOG_STATUS,
  deriveDeceasedColumns,
  emptyToNull,
  measurementForWrite,
  resolveRequiredCallName,
} from './dogWriteRules';

// Re-exported so existing callers (and their tests) keep one import site for
// the dog write path; `dogWriteRules` is where they are defined.
export {
  deriveDeceasedColumns,
  normalizeDogInputForWrite,
  resolveRequiredCallName,
} from './dogWriteRules';

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
  const callName = resolveRequiredCallName(input);
  // Resolved once so the `deceased` columns are derived from the status the row
  // will actually carry, not from the (possibly absent) input status.
  const status = input.status || DEFAULT_DOG_STATUS;

  const dbInsert: DbDogInsert = {
    // MYK9-90 §5.3 — `dogs.name` is a nullable legacy alias, not a name the app
    // owns. It is deliberately NOT fed `input.name`: that field carries the call
    // name on most create paths, and copying it here is exactly the duplicated
    // identity storage this change removes. The call name goes to `call_name`;
    // the registered name goes to `dog_registrations.registered_name`.
    name: null,
    breed: input.breed,
    date_of_birth: input.birthDate || null,
    sex: emptyToNull(input.sex),
    color: input.color || null,
    weight: measurementForWrite(input.weight),
    height: measurementForWrite(input.height),
    owner_id: input.ownerId,
    microchip_number: input.microchipNumber || null,
    image_url: input.imageUrl || null,
    call_name: callName,
    spayed_neutered: input.spayedNeutered ?? null,
    status,
    ...deriveDeceasedColumns(status, input.deceasedDate),
    // Note: registrations and health records are handled in separate tables
    // Note: ID is explicitly omitted to allow database auto-generation
  };

  // Strip any `id` that leaked in from DogInput — callers that need a
  // client-specified id (local-first create) spread this result and set
  // `id` explicitly afterward.
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

  // MYK9-90 §5.3 — `input.name` is deliberately not written back to `dogs.name`.
  // `Dog.name` is a read-side display alias that falls back to the call name
  // (see `mapDatabaseToDog`), so echoing it into the column would silently
  // re-copy the call name into the legacy column on every edit.
  // MYK9-90 §5.1 — `dogs.call_name` is NOT NULL, so an update can change it but
  // never clear it. A blank incoming call name is skipped rather than sent as
  // NULL: an edit that leaves the field empty must not strip the dog's only
  // required identifier, and failing the whole save (which may be changing an
  // unrelated field) would be worse than leaving the existing name in place.
  if (input.callName) update.call_name = input.callName;
  if (input.breed !== undefined) update.breed = input.breed;
  if (input.birthDate !== undefined) update.date_of_birth = input.birthDate || null;
  if (input.sex !== undefined) update.sex = emptyToNull(input.sex);
  if (input.color !== undefined) update.color = input.color || null;
  if (input.weight !== undefined) update.weight = measurementForWrite(input.weight);
  if (input.height !== undefined) update.height = measurementForWrite(input.height);
  if (input.ownerId !== undefined) update.owner_id = input.ownerId;
  if (input.microchipNumber !== undefined) update.microchip_number = input.microchipNumber || null;
  if (input.imageUrl !== undefined) update.image_url = input.imageUrl || null;
  if (input.spayedNeutered !== undefined) update.spayed_neutered = input.spayedNeutered;
  // The IndexedDB half of this is the `status` branch of
  // `mapPartialDogInputToReplicated`: the same patch reaches both, and a status
  // change that lands on only one of them leaves the offline read and the server
  // read disagreeing until something happens to refetch.
  if (input.status !== undefined) {
    update.status = input.status;
    Object.assign(update, deriveDeceasedColumns(input.status, input.deceasedDate));
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
    status?: string | undefined;
    deceasedDate?: string | undefined;
    deletedAt?: string | null | undefined;
    deleted_at?: string | null | undefined;
  },
  options?: {
    owner?: Record<string, unknown> | null;
    registrations?: Record<string, unknown>[];
    entries?: Record<string, unknown>[];
    healthRecords?: Record<string, unknown>[];
  }
): Record<string, unknown> => {
  const row: Record<string, unknown> = {
    // Read-side adapter only (it also carries `owner` / `registrations` embeds):
    // it reshapes a replicated row for `mapDatabaseToDog`, it is not a write
    // path, so carrying `name` through is fidelity rather than a re-copy.
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
      status: 'status',
      deceased_date: 'deceasedDate',
    }),
    co_owner_id: null,
    deleted_at: d.deletedAt ?? d.deleted_at ?? null,
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
/**
 * Registration rows reach this mapper in snake_case (PostgREST, offline replica
 * rows via `toSupabaseRow`) or camelCase (already-mapped `Registration[]` taken
 * from the dogs query cache). Read both so no path silently loses a field.
 */
const regCreatedAt = (reg: Record<string, unknown>): string | null =>
  (reg.created_at as string | null) ?? (reg.createdAt as string | null) ?? null;
const regIsPrimary = (reg: Record<string, unknown>): boolean | null =>
  (reg.is_primary as boolean | null) ?? (reg.isPrimary as boolean | null) ?? null;
const regRegisteredName = (reg: Record<string, unknown>): string =>
  ((reg.registered_name as string) || (reg.registeredName as string)) ?? '';
const regNumber = (reg: Record<string, unknown>): string =>
  ((reg.registration_number as string) || (reg.registrationNumber as string)) ?? '';
/** Variety keeps the same key in both casings; normalized here for symmetry (#1480). */
const regVariety = (reg: Record<string, unknown>): string | null =>
  (reg.variety as string | null) || null;

export const mapDatabaseToDog = (dbDog: Record<string, unknown>): Dog => {
  const sex = dbDog.sex as 'male' | 'female' | null;
  const dateOfBirth = dbDog.date_of_birth as string | null;

  const registrationRows: Record<string, unknown>[] = Array.isArray(dbDog.registrations)
    ? (dbDog.registrations as Record<string, unknown>[])
    : [];

  // Breed belongs to a registration, not to the dog. This is a generic surface
  // (no organization in context), so the primary registration answers — and an
  // unregistered dog has no breed rather than a guessed one. Callers render the
  // absence via `getDogBreedLabel`; nothing substitutes a value.
  const identity = resolveDogIdentity(registrationRows as DogRegistrationLike[]);

  return {
    id: dbDog.id as string,
    // MYK9-90 §5.2 — `dogs.name` is a nullable legacy alias and is NULL for
    // every dog created after that migration. `Dog.name` stays a non-empty
    // display alias by falling back to the (now NOT NULL) call name, so no
    // surface that renders `dog.name` blanks out. It is NOT a registered name:
    // that lives on `dog_registrations`, resolved via `@/features/dogs/identity`.
    name: ((dbDog.name as string | null) ?? (dbDog.call_name as string | null) ?? '') as string,
    callName: (dbDog.call_name as string) || (dbDog.name as string), // Use call_name if available, fallback to name
    breed: identity.breed ?? '',
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
    registrations: registrationRows.map((reg: Record<string, unknown>) => ({
      id: reg.id as string,
      organization: (reg.organization as string) || '',
      registeredName: regRegisteredName(reg),
      // Never backfill from `dogs.breed` (as `main` still did here): that turns
      // the dog record into a breed claim made to a sanctioning organization.
      breed: (reg.breed as string) || '',
      // Carry the resolver's ordering fields through the mapping, or anything
      // that re-resolves from `Dog.registrations` orders by `id` instead and
      // disagrees with `identity` above. Both casings are accepted because this
      // list is the MERGE of snake_case PostgREST rows and camelCase rows from
      // the offline replica (`loadRegistrationsMap`).
      ...(regVariety(reg) != null ? { variety: regVariety(reg) as string } : {}),
      ...(regCreatedAt(reg) != null ? { createdAt: regCreatedAt(reg) as string } : {}),
      ...(regIsPrimary(reg) != null ? { isPrimary: regIsPrimary(reg) as boolean } : {}),
      registrationNumber: regNumber(reg),
      status: (reg.status as string) || 'active',
    })),
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
 * Map a DogInput + explicit id to a ReplicatedDog for IndexedDB storage.
 * Used by the local-first create path: write to IndexedDB before PostgREST.
 * weight/height are numbers in DogInput but strings in ReplicatedDog.
 */
export const mapDogInputToReplicated = (input: DogInput, id: string): ReplicatedDog => {
  return {
    id,
    name: input.name,
    // MYK9-90 §5.1 — throws on a missing or whitespace-only call name. This is
    // the FIRST statement of `addDogOfflineFirst`, so a rejected dog is never
    // written to IndexedDB and never queued for sync; on the offline-first
    // show-day path there is no rollback and no user left to correct a mutation
    // that dies at the server hours later.
    callName: resolveRequiredCallName(input),
    breed: input.breed,
    sex: emptyToNull(input.sex) ?? undefined,
    dateOfBirth: input.birthDate || undefined,
    ownerId: input.ownerId || undefined,
    color: input.color || undefined,
    weight: measurementForWrite(input.weight) ?? undefined,
    height: measurementForWrite(input.height) ?? undefined,
    microchipNumber: input.microchipNumber || undefined,
    imageUrl: input.imageUrl || undefined,
    isSpayedNeutered: input.spayedNeutered ?? undefined,
    // Same default as `mapDogInputToInsert`, so a dog created offline reads back
    // with the status it will have once the queued insert lands.
    status: input.status || DEFAULT_DOG_STATUS,
    deceasedDate: input.deceasedDate || undefined,
  };
};

/** Map Partial<DogInput> fields to Partial<ReplicatedDog> for IndexedDB merge updates. */
export const mapPartialDogInputToReplicated = (
  updates: Partial<DogInput>
): Partial<ReplicatedDog> => {
  const partial: Partial<ReplicatedDog> = {};
  if (updates.name !== undefined) partial.name = updates.name;
  // MYK9-90 §5.1 — must stay byte-for-byte identical to the `call_name` line in
  // `mapDogInputToUpdate`: same skip-when-blank rule, and NO trimming here.
  // Normalisation belongs to `normalizeDogInputForWrite`, above both writes —
  // trimming in one mapper and not the other is exactly how the local copy and
  // the server copy drifted apart.
  if (updates.callName) partial.callName = updates.callName;
  if (updates.breed !== undefined) partial.breed = updates.breed;
  if (updates.birthDate !== undefined) partial.dateOfBirth = updates.birthDate || undefined;
  // `?? undefined` is a vocabulary translation, not a second opinion: the rule
  // itself (blank / `0` means cleared) lives in the shared helpers, so the DB
  // "cleared" (`null`) and the IndexedDB "cleared" (`undefined`) can no longer
  // drift apart into `null` on one side and `"0"` / `''` on the other.
  if (updates.sex !== undefined) partial.sex = emptyToNull(updates.sex) ?? undefined;
  if (updates.color !== undefined) partial.color = updates.color || undefined;
  if (updates.weight !== undefined)
    partial.weight = measurementForWrite(updates.weight) ?? undefined;
  if (updates.height !== undefined)
    partial.height = measurementForWrite(updates.height) ?? undefined;
  if (updates.ownerId !== undefined) partial.ownerId = updates.ownerId || undefined;
  if (updates.microchipNumber !== undefined)
    partial.microchipNumber = updates.microchipNumber || undefined;
  if (updates.imageUrl !== undefined) partial.imageUrl = updates.imageUrl || undefined;
  if (updates.spayedNeutered !== undefined) partial.isSpayedNeutered = updates.spayedNeutered;
  // Mirrors the `status` branch of `mapDogInputToUpdate`, down to keying the
  // deceased date off `status` rather than off its own presence. Retiring a dog
  // used to update Supabase only, leaving the local replicated row on its old
  // status until an unrelated refetch happened to overwrite it — the offline
  // read and the server read said different things in the meantime.
  //
  // `deceased` is deliberately NOT carried: it is `status === 'deceased'`
  // restated, and `ReplicatedDogsTable.toSupabaseRow` derives it at write time,
  // so there is no second copy to fall out of step. `deceasedDate` is real data
  // and IS carried — without it the local read drops the date, and the next edit
  // round-trips that gap back to the server as `deceased_date: null`.
  if (updates.status !== undefined) {
    partial.status = updates.status;
    partial.deceasedDate = updates.deceasedDate || undefined;
  }
  return partial;
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
