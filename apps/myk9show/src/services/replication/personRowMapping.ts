import type { Database } from '@/types/supabase';
import {
  PERSON_QUEUED_UPDATE_COLUMNS,
  type PersonQueuedUpdateColumn,
} from '@/services/database/users/peopleColumns';

/** Row shapes for the people replica (MYK9-1071). */

export type PersonReplicaRow = Pick<
  Database['public']['Tables']['people']['Row'],
  | 'id'
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'phone'
  | 'street_address'
  | 'city'
  | 'state'
  | 'zip_code'
  | 'country'
  | 'profile_image'
  | 'auth_user_id'
  | 'status'
  | 'created_at'
  | 'updated_at'
  | 'deleted_at'
  | 'deleted_by'
  | 'version'
>;

export interface ReplicatedShowDeskPerson {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
  profileImage?: string | null;
  /**
   * Replicated so the sign-in-email decision can run without a network read.
   * NEVER an identity source: who the signed-in user is comes from
   * usePersonIdentity, not from this replica (LESSON offline-identity-pairing).
   */
  authUserId?: string | null;
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdFromShowId?: string | null;
  _version?: number;
  _lastModified?: Date;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean;
}

export function rowToPerson(row: PersonReplicaRow): ReplicatedShowDeskPerson {
  return {
    id: String(row.id),
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    address: row.street_address,
    city: row.city,
    state: row.state,
    zipCode: row.zip_code,
    country: row.country,
    profileImage: row.profile_image,
    authUserId: row.auth_user_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The person's current values for the queued-update columns, keyed by column. */
export function personQueuedColumnValues(
  person: ReplicatedShowDeskPerson
): Record<PersonQueuedUpdateColumn, string | null> {
  return {
    first_name: person.firstName,
    last_name: person.lastName,
    phone: person.phone ?? null,
    street_address: person.address ?? null,
    city: person.city ?? null,
    state: person.state ?? null,
    zip_code: person.zipCode ?? null,
    country: person.country ?? null,
    profile_image: person.profileImage ?? null,
  };
}

/** Apply a queued-update column patch to the local row. */
export function applyPersonColumns(
  person: ReplicatedShowDeskPerson,
  patch: Partial<Record<PersonQueuedUpdateColumn, string | null>>
): ReplicatedShowDeskPerson {
  const next = { ...person };
  if ('first_name' in patch) next.firstName = patch.first_name ?? '';
  if ('last_name' in patch) next.lastName = patch.last_name ?? '';
  if ('phone' in patch) next.phone = patch.phone ?? null;
  if ('street_address' in patch) next.address = patch.street_address ?? null;
  if ('city' in patch) next.city = patch.city ?? null;
  if ('state' in patch) next.state = patch.state ?? null;
  if ('zip_code' in patch) next.zipCode = patch.zip_code ?? null;
  if ('country' in patch) next.country = patch.country ?? null;
  if ('profile_image' in patch) next.profileImage = patch.profile_image ?? null;
  return next;
}

const QUEUED_COLUMN_SET: ReadonlySet<string> = new Set(PERSON_QUEUED_UPDATE_COLUMNS);

/**
 * The changed fields of a person save, restricted to PERSON_QUEUED_UPDATE_COLUMNS.
 * Any other key (email included, decision D2) throws BEFORE anything is written
 * or queued: the allowlist is enforced on the payload, not trusted to callers.
 */
export function buildQueuedPersonDelta(
  person: ReplicatedShowDeskPerson,
  updates: Record<string, unknown>
): Partial<Record<PersonQueuedUpdateColumn, string | null>> {
  const unknownKeys = Object.keys(updates).filter(key => !QUEUED_COLUMN_SET.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`These person fields cannot be saved offline: ${unknownKeys.join(', ')}`);
  }
  const current = personQueuedColumnValues(person);
  const delta: Partial<Record<PersonQueuedUpdateColumn, string | null>> = {};
  for (const column of PERSON_QUEUED_UPDATE_COLUMNS) {
    if (!(column in updates)) continue;
    const raw = updates[column];
    const next = raw === undefined || raw === null ? null : String(raw);
    if (next !== current[column]) delta[column] = next;
  }
  return delta;
}
