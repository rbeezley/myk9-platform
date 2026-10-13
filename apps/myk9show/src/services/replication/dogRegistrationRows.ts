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
   * Set by a queued delete (MYK9-1075): the row stays until the delete
   * uploads, hidden from every reader by {@link visibleRegistrationRows}.
   */
  _pendingDelete?: boolean;
  /**
   * A registration added on this device with its own queued INSERT under this
   * id (`addRegistration`), as opposed to a placeholder (see {@link isPlaceholder}).
   */
  _queuedAdd?: boolean;
  /**
   * On a placeholder: the id of the dog the offline create wrote it for. The
   * upload may remap `dogId` to an existing dog; this does not move, so the
   * create's placeholders can still be told apart (MYK9-1129).
   */
  _placeholderOf?: string;
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
 * `created_at`. An edit sends only the ones it changed
 * (`registrationChangePayload`); `updateRegistration` refuses a patch naming
 * any other key.
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

/**
 * The UPDATE payload for an edit: only the columns the user changed
 * (`registrationChanges`), plus `updated_at` (Codex final round). Columns the
 * user did not touch are never sent, so another device's change to them
 * survives even when this write carries the newer OCC token.
 */
export function registrationChangePayload(
  changes: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  return { ...changes, updated_at: new Date().toISOString() };
}

/**
 * A placeholder: a registration an offline dog create wrote to the device. It
 * uploads inside the dog's `create_dog_with_registrations`, which gives the
 * server copy a NEW id, so it is matched to that copy by content. A queued add
 * (`_queuedAdd`) is not one: it uploads its own INSERT under its own id. A
 * `_localOnly` row without the add mark is a placeholder.
 */
export function isPlaceholder(row: Pick<ReplicatedDogRegistration, '_localOnly' | '_queuedAdd'>) {
  return row._localOnly === true && row._queuedAdd !== true;
}

/**
 * A device-only add proven to be on the server: a server row with its id was
 * seen, so its INSERT landed even if the acknowledgement was lost (Codex
 * round 3). It becomes an ordinary server-backed row: both device-only flags
 * go together, so it is never mistaken for a placeholder.
 */
export function asServerBacked(row: ReplicatedDogRegistration): ReplicatedDogRegistration {
  const serverBacked = { ...row };
  delete serverBacked._localOnly;
  delete serverBacked._queuedAdd;
  return serverBacked;
}

/** The INSERT payload for a registration created on this device. */
export function registrationInsertRow(
  registration: ReplicatedDogRegistration
): Record<string, unknown> {
  return {
    id: registration.id,
    dog_id: registration.dogId,
    organization: registration.organization,
    registration_number: registration.registrationNumber,
    // Carried so the merged local+server list keeps the resolver's ordering.
    // Local creation does not currently assign `isPrimary`, so it is omitted
    // from the mutation payload and the server default remains authoritative.
    created_at: registration.createdAt,
    registered_name: registration.registeredName ?? null,
    breed: registration.breed ?? null,
    variety: registration.variety ?? null,
    status: registration.status ?? 'pending',
    registration_date: registration.registrationDate ?? null,
    application_number: registration.applicationNumber ?? null,
    submission_date: registration.submissionDate ?? null,
    certificate: registration.certificate ?? null,
    verified: registration.verified ?? false,
    updated_at: new Date().toISOString(),
  };
}

/** The fields twin matching reads, in either row shape. */
export interface TwinFields {
  dogId: string;
  createdAt?: string | null | undefined;
  organization?: string | null | undefined;
  registrationNumber?: string | null | undefined;
}

/** A snake_case registration row (PostgREST or `registrationToDbRow`) as TwinFields. */
export function twinFieldsOfDbRow(row: Record<string, unknown>): TwinFields {
  return {
    dogId: String(row.dog_id ?? ''),
    createdAt: (row.created_at as string | null | undefined) ?? null,
    organization: (row.organization as string | null | undefined) ?? null,
    registrationNumber: (row.registration_number as string | null | undefined) ?? null,
  };
}

/**
 * Same dog, same creation instant. An offline create stamps each
 * registration's `created_at` on the device and sends that value in the RPC
 * payload, which stores it, so a placeholder and its server copy carry the
 * identical instant. Compared as epoch ms: the server answers timestamptz
 * (`+00:00`), the device wrote `Z`.
 */
function createdTwinKey(row: TwinFields): string | null {
  const ms = row.createdAt ? Date.parse(row.createdAt) : Number.NaN;
  return Number.isFinite(ms) ? `${row.dogId}|t:${ms}` : null;
}

/**
 * Same dog, organization and number, normalised. The fallback for a
 * placeholder with no usable `created_at`, and the dedupe the readers already
 * apply between server and device rows.
 */
export function registrationIdentityKey(row: TwinFields): string | null {
  const organization = normalizeDogRegistrationOrganization(row.organization);
  const number = normalizeDogRegistrationNumber(row.registrationNumber);
  return organization && number ? `${row.dogId}|${organization}|${number}` : null;
}

export interface ServerTwinIndex {
  created: ReadonlySet<string>;
  identity: ReadonlySet<string>;
}

export function indexServerTwins(serverRows: readonly TwinFields[]): ServerTwinIndex {
  const keys = (key: (row: TwinFields) => string | null) =>
    new Set(serverRows.map(key).filter((k): k is string => k !== null));
  return { created: keys(createdTwinKey), identity: keys(registrationIdentityKey) };
}

/**
 * The one definition of "this placeholder's server copy is here": a server row
 * on the same dog with the same `created_at` instant (the device sends it to
 * `create_dog_with_registrations`), OR the same organization and number. The
 * second also covers the RPC mapping an offline create onto an EXISTING dog
 * that already holds that registration: no new row (so no `created_at` twin),
 * and the placeholder's dog id is remapped to that dog (adversarial review).
 * Safe because one dog cannot hold two live rows with the same organization
 * and number (`dog_registrations_live_org_number_unique`).
 */
export function hasServerTwin(placeholder: TwinFields, twins: ServerTwinIndex): boolean {
  const created = createdTwinKey(placeholder);
  if (created !== null && twins.created.has(created)) return true;
  const identity = registrationIdentityKey(placeholder);
  return identity !== null && twins.identity.has(identity);
}

/**
 * The placeholders whose server copy is here (`hasServerTwin`), plus their
 * siblings from a create the server MERGED onto an existing dog (MYK9-1129).
 * When `create_dog_with_registrations` finds one of the create's registrations
 * on an existing dog, it returns that dog and inserts nothing, so the other
 * placeholders of the same create never get a server copy. The upload remaps
 * their dog id to the existing dog (`dogId !== _placeholderOf`); once any one
 * of that create resolves, all of them are resolved.
 */
export function resolvedPlaceholderIds(
  placeholders: readonly ReplicatedDogRegistration[],
  twins: ServerTwinIndex
): Set<string> {
  const resolved = new Set<string>();
  const mergedCreates = new Set<string>();
  for (const row of placeholders) {
    if (!hasServerTwin(row, twins)) continue;
    resolved.add(row.id);
    if (row._placeholderOf && row._placeholderOf !== row.dogId)
      mergedCreates.add(row._placeholderOf);
  }
  for (const row of placeholders) {
    if (
      row._placeholderOf &&
      row._placeholderOf !== row.dogId &&
      mergedCreates.has(row._placeholderOf)
    ) {
      resolved.add(row.id);
    }
  }
  return resolved;
}

/**
 * The rows a reader may show for these dogs: never a row waiting on its
 * delete, and never a placeholder once its server copy is on the device
 * (`resolvedPlaceholderIds`). A placeholder's twin may be a row this device is
 * deleting; a queued add is shown even when a row it replaces is being
 * deleted (a re-add). Every device-copy reader goes through this.
 */
export function visibleRegistrationRows(
  rows: readonly ReplicatedDogRegistration[],
  dogIds: readonly string[]
): ReplicatedDogRegistration[] {
  const wanted = new Set(dogIds);
  const forDogs = rows.filter(row => wanted.has(row.dogId));
  const twins = indexServerTwins(forDogs.filter(row => row._localOnly !== true));
  const live = forDogs.filter(row => row._pendingDelete !== true);
  const resolved = resolvedPlaceholderIds(live.filter(isPlaceholder), twins);
  return live.filter(row => !resolved.has(row.id));
}

/**
 * Only the work this device has not sent, for these dogs: dirty rows (edits,
 * pending deletes, queued adds) and `_localOnly` placeholders, raw. A server
 * read is merged with these (`mergeUnsentWork`), never with clean cached
 * copies, which may be rows the server no longer returns.
 */
export function unsentRegistrationWork(
  stored: readonly ReplicatedRow<ReplicatedDogRegistration>[],
  dogIds: readonly string[]
): ReplicatedDogRegistration[] {
  const wanted = new Set(dogIds);
  return stored
    .filter(row => row.isDirty || row.data?._localOnly === true)
    .map(row => row.data)
    .filter(row => wanted.has(row.dogId));
}
