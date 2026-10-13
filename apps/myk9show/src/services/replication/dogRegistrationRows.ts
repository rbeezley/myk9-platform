/**
 * Row shapes for the `dog_registrations` replica (MYK9-1090): the server
 * select list, the server-to-local mapper, the read shape every reader gets,
 * and the allowlisted UPDATE payload.
 */
import type { ReplicatedRow } from '@myk9/replication';
import type { Database } from '@/types/supabase';
import {
  normalizeDogRegistrationNumber,
  normalizeDogRegistrationOrganization,
} from '@/utils/dogIdentity';

/**
 * Every column the replica reads, named: never `*`. `dog_deleted_at` is left
 * out on purpose: RLS hides a registration whose dog is soft-deleted, so a row
 * the client can read always has it NULL.
 */
export const DOG_REGISTRATION_SELECT =
  'id, dog_id, organization, registration_number, registration_date, verified, created_at, updated_at, registered_name, breed, variety, status, application_number, submission_date, certificate, is_primary, version';

/** PostgREST's max_rows (supabase/config.toml): one page of every keyset fetch. */
export const DOG_REGISTRATIONS_PAGE_SIZE = 1000;

export type DogRegistrationRow = Omit<
  Database['public']['Tables']['dog_registrations']['Row'],
  'dog_deleted_at'
>;

/** The row every registration reader returns: PostgREST's columns, less sync metadata. */
export type DogRegistrationReadRow = Omit<DogRegistrationRow, 'version'>;

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
   * `createdAt` is REQUIRED (#1480) because both creation paths always stamp
   * it. `isPrimary` stays optional because local creation does not assign the
   * owner's primary-registration choice.
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
  updatedAt?: string | null;
  /**
   * Set by a queued delete (MYK9-1075, PR 3): the row stays until the delete
   * uploads, hidden from every reader by {@link visibleRegistrationRows}.
   */
  _pendingDelete?: boolean;
  _version?: number;
  _lastModified?: Date;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict';
  /**
   * A registration written on this device that the server has not got under
   * this id. An offline dog create stores its registrations this way; the
   * server inserts them with its own ids, so these rows are placeholders until
   * the dog uploads (see `pruneRegistrationsMissingFromServer`).
   */
  _localOnly?: boolean;
}

export function rowToRegistration(row: DogRegistrationRow): ReplicatedDogRegistration {
  return {
    id: String(row.id),
    dogId: String(row.dog_id),
    organization: row.organization,
    registrationNumber: row.registration_number,
    createdAt: row.created_at ?? '',
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
    updatedAt: row.updated_at,
  };
}

/**
 * The snake_case shape every registration reader returns, the same columns a
 * PostgREST read of the table gives (less `version`, which is sync metadata).
 */
export function registrationToDbRow(
  registration: ReplicatedDogRegistration
): DogRegistrationReadRow {
  return {
    id: registration.id,
    dog_id: registration.dogId,
    organization: registration.organization,
    registration_number: registration.registrationNumber,
    registration_date: registration.registrationDate ?? null,
    verified: registration.verified ?? false,
    created_at: registration.createdAt,
    updated_at: registration.updatedAt ?? null,
    registered_name: registration.registeredName ?? null,
    breed: registration.breed ?? null,
    variety: registration.variety ?? null,
    status: registration.status ?? null,
    application_number: registration.applicationNumber ?? null,
    submission_date: registration.submissionDate ?? null,
    certificate: registration.certificate ?? null,
    is_primary: registration.isPrimary ?? false,
  };
}

/**
 * The only columns a queued registration UPDATE may write (plan §3). Never
 * `dog_id` (it fires the deleted-marker trigger), `verified`, `is_primary` or
 * `created_at`.
 */
export const REGISTRATION_UPDATE_COLUMNS = [
  'organization',
  'registration_number',
  'registered_name',
  'breed',
  'variety',
  'status',
  'registration_date',
  'updated_at',
] as const;

/** The full-row UPDATE payload for a registration, allowlisted columns only. */
export function buildRegistrationUpdatePayload(
  registration: ReplicatedDogRegistration
): Record<string, unknown> {
  return {
    organization: registration.organization,
    registration_number: registration.registrationNumber,
    registered_name: registration.registeredName ?? null,
    breed: registration.breed ?? null,
    variety: registration.variety ?? null,
    status: registration.status ?? null,
    registration_date: registration.registrationDate ?? null,
    updated_at: new Date().toISOString(),
  };
}

function identityKey(registration: ReplicatedDogRegistration): string | null {
  const organization = normalizeDogRegistrationOrganization(registration.organization);
  const number = normalizeDogRegistrationNumber(registration.registrationNumber);
  return organization && number ? `${registration.dogId}|${organization}|${number}` : null;
}

/**
 * The rows a reader may show for these dogs: never a row waiting on its
 * delete, and never a placeholder once the server's copy of the same
 * registration (same dog, organization and number) is on the device. Every
 * registration reader goes through this, so a new hiding rule lands once.
 */
export function visibleRegistrationRows(
  rows: readonly ReplicatedDogRegistration[],
  dogIds: readonly string[]
): ReplicatedDogRegistration[] {
  const wanted = new Set(dogIds);
  const live = rows.filter(row => wanted.has(row.dogId) && row._pendingDelete !== true);
  const serverIdentities = new Set(live.filter(row => row._localOnly !== true).map(identityKey));
  return live.filter(row => {
    if (row._localOnly !== true) return true;
    const key = identityKey(row);
    return key === null || !serverIdentities.has(key);
  });
}

/**
 * Only the work this device has not sent: dirty rows and `_localOnly`
 * placeholders (still hidden once their server twin is here). An untrusted
 * replica adds these to a server read, never its clean cached copies, which
 * may be rows the server no longer returns.
 */
export function unsentRegistrationRows(
  stored: readonly ReplicatedRow<ReplicatedDogRegistration>[],
  dogIds: readonly string[]
): ReplicatedDogRegistration[] {
  const unsent = new Set(
    stored.filter(row => row.isDirty || row.data?._localOnly === true).map(row => row.id)
  );
  return visibleRegistrationRows(
    stored.map(row => row.data),
    dogIds
  ).filter(row => unsent.has(row.id));
}
