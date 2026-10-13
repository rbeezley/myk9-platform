/**
 * Shapes for the queued registration writes (MYK9-1090 plan §3, MYK9-1075):
 * what an Edit dog form changed (allowlisted), a new registration from a form draft, and the
 * refusals a save panel shows.
 */
import type { DogInput } from '@/store/dogStore';
import type { DbDogRegistrationInsert } from '@/types/database-mappings';
import { FriendlySaveError } from '@/utils/friendlySaveError';
import { REGISTRATION_UPDATE_COLUMNS, type ReplicatedDogRegistration } from './dogRegistrationRows';

/** The refusal for a write whose registrations this device does not hold (plan §1 "Cold replica"). */
export const REGISTRATIONS_NEED_CONNECTION = "Reconnect to load this dog's registrations";

export function registrationsNeedConnection(): FriendlySaveError {
  return new FriendlySaveError(REGISTRATIONS_NEED_CONNECTION);
}

/**
 * The refusal for Edit dog's registration fields when the server cannot be
 * read and the form names an organization with no registration on the device:
 * "new" cannot be told from "not loaded", so nothing is inferred (Codex review
 * of PR 3a). Offline adds go through Manage registrations' explicit Add.
 */
export const REGISTRATION_CHANGES_NEED_CONNECTION = 'Reconnect to save registration changes';

export function registrationChangesNeedConnection(): FriendlySaveError {
  return new FriendlySaveError(REGISTRATION_CHANGES_NEED_CONNECTION);
}

/**
 * The OCC token of a registration the device adds: the INSERT never sends
 * `version`, so the server's column default applies (`version integer NOT
 * NULL DEFAULT 1`, 20261009214700; the trigger bumps it on UPDATE only).
 */
export const NEW_REGISTRATION_VERSION = 1;

/**
 * The refusal for editing or deleting a registration that travels inside its
 * dog's queued create: it has no server row of its own to change until the dog
 * uploads.
 */
export function registrationAwaitsItsDog(): FriendlySaveError {
  return new FriendlySaveError(
    'This registration is still being saved with its dog. Reconnect, then try again.'
  );
}

type UpdateColumn = (typeof REGISTRATION_UPDATE_COLUMNS)[number];

const FIELD_OF_COLUMN: Record<UpdateColumn, keyof ReplicatedDogRegistration> = {
  organization: 'organization',
  registration_number: 'registrationNumber',
  registered_name: 'registeredName',
  breed: 'breed',
  variety: 'variety',
  status: 'status',
  registration_date: 'registrationDate',
  updated_at: 'updatedAt',
};

function isUpdateColumn(key: string): key is UpdateColumn {
  return (REGISTRATION_UPDATE_COLUMNS as readonly string[]).includes(key);
}

/**
 * Throws on any key outside `REGISTRATION_UPDATE_COLUMNS`, so an edit naming
 * `dog_id`, `verified`, `is_primary` or `created_at` is refused BEFORE
 * anything is read, written or queued.
 */
export function assertRegistrationPatch(patch: Readonly<Record<string, unknown>>): void {
  const unknown = Object.keys(patch).filter(key => !isUpdateColumn(key));
  if (unknown.length > 0) {
    throw new Error(`Registration edit names columns it may not write: ${unknown.join(', ')}`);
  }
}

/** Blank, null and absent are one value when telling what an edit changed. */
const comparable = (value: unknown) => (value === undefined || value === '' ? null : value);

/**
 * The columns an edit changes: each patch column whose value differs from the
 * row the edit was made against (`updated_at` is never one; it is stamped).
 */
export function registrationChanges(
  row: ReplicatedDogRegistration,
  patch: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  assertRegistrationPatch(patch);
  const changes: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(patch)) {
    if (value === undefined || !isUpdateColumn(column) || column === 'updated_at') continue;
    const current = (row as unknown as Record<string, unknown>)[FIELD_OF_COLUMN[column]];
    if (comparable(value) !== comparable(current)) changes[column] = value;
  }
  return changes;
}

/**
 * Distinct, ordered creation timestamps for a batch.
 *
 * A plain `new Date().toISOString()` per row ties when several registrations are
 * created in the same millisecond — which is the normal case for a batch — and a
 * tie sends the resolver to its `id` (random UUID) tiebreak. Offsetting by index
 * keeps creation ORDER, so the first registration entered stays primary.
 */
export function createRegistrationTimestamps(count: number): string[] {
  const base = Date.now();
  return Array.from({ length: count }, (_, i) => new Date(base + i).toISOString());
}

export type RegistrationInput = NonNullable<DogInput['registrations']>[number];

/** A registration from the dog form's shape, with its creation instant. */
export function normalizeRegistration(
  input: RegistrationInput,
  createdAt: string
): Omit<ReplicatedDogRegistration, 'id' | 'dogId'> {
  return {
    organization: input.organization || 'AKC',
    registrationNumber: input.number || '',
    registeredName: input.registeredName || null,
    breed: input.type || null,
    status: input.status || 'pending',
    verified: false,
    // Stamped at construction, NOT left for the server default. The identity
    // resolver orders by `created_at`, so without it a dog created offline with
    // several registrations resolved by random UUID rather than creation order
    // until a server round trip (MYK9-90 review round 3).
    createdAt,
  };
}

/** The columns an added registration may carry (never `verified` or `is_primary`). */
export type RegistrationDraft = Pick<DbDogRegistrationInsert, 'dog_id'> &
  Partial<
    Pick<
      DbDogRegistrationInsert,
      | 'organization'
      | 'registration_number'
      | 'registered_name'
      | 'breed'
      | 'variety'
      | 'status'
      | 'registration_date'
      | 'application_number'
      | 'submission_date'
      | 'certificate'
    >
  >;

/** A registration from a form draft (Manage registrations, add-entry inline add). */
export function draftToRegistration(
  draft: RegistrationDraft,
  createdAt: string
): Omit<ReplicatedDogRegistration, 'id' | 'dogId'> {
  return {
    organization: draft.organization || 'AKC',
    registrationNumber: draft.registration_number || '',
    registeredName: draft.registered_name || null,
    breed: draft.breed || null,
    variety: draft.variety || null,
    status: draft.status || 'pending',
    registrationDate: draft.registration_date || null,
    applicationNumber: draft.application_number || null,
    submissionDate: draft.submission_date || null,
    certificate: draft.certificate || null,
    verified: false,
    createdAt,
  };
}
