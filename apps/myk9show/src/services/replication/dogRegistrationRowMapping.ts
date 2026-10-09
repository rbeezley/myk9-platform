import type { Database } from '@/types/supabase';

/**
 * Row shapes and column lists for the dog_registrations replica (MYK9-1071).
 * Kept apart from the table class so the class stays a sync/queue surface.
 */

export type DogRegistrationRow = Database['public']['Tables']['dog_registrations']['Row'];

/**
 * Every column the online `select('*')` registration reads use, minus
 * `dog_deleted_at` (RLS already hides a deleted dog's registrations), plus the
 * OCC `version`. ONE string literal: the typed PostgREST client parses it.
 */
export const DOG_REGISTRATION_REPLICA_COLUMNS =
  'id, dog_id, organization, registration_number, registration_date, verified, created_at, updated_at, registered_name, breed, variety, status, application_number, submission_date, certificate, is_primary, version' as const;

/**
 * The only columns a queued registration UPDATE sends. Never `dog_id` (it would
 * move the row and fire the deleted-marker trigger), `created_at`, `verified`, or
 * `is_primary` (no edit path here chooses the primary registration).
 */
export const REGISTRATION_UPDATE_COLUMNS = [
  'organization',
  'registration_number',
  'registered_name',
  'breed',
  'variety',
  'status',
  'registration_date',
  'application_number',
  'submission_date',
  'certificate',
] as const;

export interface ReplicatedDogRegistration {
  id: string;
  dogId: string;
  organization: string;
  registrationNumber: string;
  /**
   * The identity resolver's ordering fields. Locally-cached registrations are
   * merged with server rows before breed resolution, so dropping these made the
   * comparator fall back to ordering by `id` for any dog with an offline
   * registration (MYK9-90 review round 2).
   *
   * `createdAt` is REQUIRED (#1480) because both creation paths always stamp it.
   * `isPrimary` is optional because local creation does not assign the owner's
   * primary-registration choice; synced rows carry the server's value.
   */
  createdAt: string;
  isPrimary?: boolean | null;
  registeredName?: string | null;
  breed?: string | null;
  variety?: string | null;
  status?: string | null;
  verified?: boolean | null;
  registrationDate?: string | null;
  applicationNumber?: string | null;
  submissionDate?: string | null;
  certificate?: string | null;
  _version?: number;
  _lastModified?: Date;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean;
}

/** The fields a registration edit may change (camelCase), mapped 1:1 onto REGISTRATION_UPDATE_COLUMNS. */
export type RegistrationEditableFields = Pick<
  ReplicatedDogRegistration,
  | 'organization'
  | 'registrationNumber'
  | 'registeredName'
  | 'breed'
  | 'variety'
  | 'status'
  | 'registrationDate'
  | 'applicationNumber'
  | 'submissionDate'
  | 'certificate'
>;

export function rowToRegistration(row: DogRegistrationRow): ReplicatedDogRegistration {
  return {
    id: String(row.id),
    dogId: String(row.dog_id),
    organization: row.organization,
    registrationNumber: row.registration_number,
    // The server stamps created_at; a NULL would only come from a legacy row.
    createdAt: row.created_at ?? new Date(0).toISOString(),
    isPrimary: row.is_primary,
    registeredName: row.registered_name,
    breed: row.breed,
    variety: row.variety,
    status: row.status,
    verified: row.verified,
    registrationDate: row.registration_date,
    applicationNumber: row.application_number,
    submissionDate: row.submission_date,
    certificate: row.certificate,
  };
}

/**
 * The snake_case row: the INSERT payload, and what replica reads hand to the
 * dog mappers (the same keys the PostgREST registration reads return).
 */
export function registrationToRow(
  registration: ReplicatedDogRegistration
): Record<string, unknown> {
  return {
    id: registration.id,
    dog_id: registration.dogId,
    organization: registration.organization,
    registration_number: registration.registrationNumber,
    // Carried so the merged list keeps the resolver's ordering.
    created_at: registration.createdAt,
    // Local creation does not assign isPrimary, so a local row omits it and the
    // server default stays authoritative; a synced row carries the server value.
    ...(registration.isPrimary !== undefined &&
      registration.isPrimary !== null && { is_primary: registration.isPrimary }),
    registered_name: registration.registeredName ?? null,
    breed: registration.breed ?? null,
    variety: registration.variety ?? null,
    status: registration.status ?? 'pending',
    verified: registration.verified ?? false,
    registration_date: registration.registrationDate ?? null,
    application_number: registration.applicationNumber ?? null,
    submission_date: registration.submissionDate ?? null,
    certificate: registration.certificate ?? null,
    updated_at: new Date().toISOString(),
  };
}

/** The full-row UPDATE payload: REGISTRATION_UPDATE_COLUMNS only, plus id and updated_at. */
export function registrationToUpdatePayload(
  registration: ReplicatedDogRegistration
): Record<string, unknown> {
  const row = registrationToRow(registration);
  const payload: Record<string, unknown> = { id: registration.id };
  for (const column of REGISTRATION_UPDATE_COLUMNS) payload[column] = row[column];
  payload.updated_at = row.updated_at;
  return payload;
}
