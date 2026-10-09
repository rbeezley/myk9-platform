import { updateUser, type PersonUpdate } from '@/services/database/users';
import { decideSignInEmailChange } from '@/services/database/users/signInEmailGuard';
import type { PersonPrivatePatch } from '@/services/database/users/personPrivate';
import { PERSON_QUEUED_UPDATE_COLUMNS } from '@/services/database/users/peopleColumns';
import {
  EMAIL_CHANGE_NEEDS_CONNECTION_CODE,
  EMAIL_CHANGE_NEEDS_CONNECTION_MESSAGE,
  PERSON_NOT_ON_DEVICE_CODE,
  PERSON_NOT_ON_DEVICE_MESSAGE,
} from '@/utils/signInEmailMessages';
import { replicatedShowDeskPeopleTable } from './ReplicatedShowDeskPeopleTable';
import type { ReplicatedShowDeskPerson } from './personRowMapping';

/**
 * One person save, queued or online (MYK9-1071).
 *
 * - The changed people columns and the private-details patch are QUEUED through
 *   `update_person_details_versioned`, so a save at a show with no connection is
 *   kept and uploads later.
 * - An email CHANGE goes online through `updateUser`, whose sign-in identity
 *   checks only work online (decision D2). Offline it is refused, and nothing is
 *   queued, so the user keeps the form and can drop the email change.
 * - An unchanged email (normalised the same way the guard compares) is dropped.
 * - `status` is the site-admin account action and never part of this save.
 */
export type PersonSaveResult =
  | {
      route: 'queued';
      person: Record<string, unknown>;
      /** The people columns this save sent to the queue (its own values). */
      columns: Record<string, unknown>;
    }
  | { route: 'online'; person: Record<string, unknown> };

export interface PersonSaveContext {
  /** The replica row, cold rule applied (useReplicaRowForEdit). */
  getRow: (personId: string) => Promise<ReplicatedShowDeskPerson | null>;
  isOnline?: () => boolean;
}

const QUEUED_COLUMNS: ReadonlySet<string> = new Set(PERSON_QUEUED_UPDATE_COLUMNS);

function refusal(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** The replica row as the snake_case people row the user mappers read. */
export function replicaPersonToDbRow(person: ReplicatedShowDeskPerson): Record<string, unknown> {
  return {
    id: person.id,
    first_name: person.firstName,
    last_name: person.lastName,
    email: person.email ?? null,
    phone: person.phone ?? null,
    street_address: person.address ?? null,
    city: person.city ?? null,
    state: person.state ?? null,
    zip_code: person.zipCode ?? null,
    country: person.country ?? null,
    profile_image: person.profileImage ?? null,
    auth_user_id: person.authUserId ?? null,
    status: person.status,
    created_at: person.createdAt ?? null,
    updated_at: person.updatedAt ?? null,
  };
}

export async function savePersonDetails(
  personId: string,
  updates: PersonUpdate,
  context: PersonSaveContext
): Promise<PersonSaveResult> {
  const isOnline = context.isOnline ?? (() => navigator.onLine);
  if (updates.status !== undefined) {
    throw new Error('Account status must be changed on its own, not as part of a profile save.');
  }

  const row = await context.getRow(personId);
  if (!row) throw refusal(PERSON_NOT_ON_DEVICE_CODE, PERSON_NOT_ON_DEVICE_MESSAGE);

  const {
    email,
    date_of_birth: dateOfBirth,
    junior_handler_numbers: juniorHandlerNumbers,
    ...rest
  } = updates;
  // The people trigger stamps updated_at; the save never sends it.
  delete rest.updated_at;

  if (email !== undefined) {
    const decision = decideSignInEmailChange(
      { authUserId: row.authUserId, currentEmail: row.email },
      email
    );
    if (!(decision.allowed && decision.reason === 'unchanged')) {
      // A real change: online only, through the guarded path.
      if (!isOnline()) {
        throw refusal(EMAIL_CHANGE_NEEDS_CONNECTION_CODE, EMAIL_CHANGE_NEEDS_CONNECTION_MESSAGE);
      }
      const { data, error } = await updateUser(personId, updates);
      if (error || !data) {
        throw Object.assign(new Error(error?.message || 'Failed to update person'), {
          code: error?.code,
        });
      }
      return { route: 'online', person: data as unknown as Record<string, unknown> };
    }
  }

  const peopleUpdates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined) continue;
    // Unknown keys reach the table, which refuses them before writing anything.
    peopleUpdates[key] = value;
  }
  const privatePatch: PersonPrivatePatch = {
    ...(dateOfBirth !== undefined && { date_of_birth: dateOfBirth || null }),
    ...(juniorHandlerNumbers !== undefined && { junior_handler_numbers: juniorHandlerNumbers }),
  };

  await replicatedShowDeskPeopleTable.updatePerson(personId, peopleUpdates, privatePatch);
  const saved = (await replicatedShowDeskPeopleTable.getPersonById(personId)) ?? row;
  const person = replicaPersonToDbRow(saved);
  // Echo the queued values so the caller's mapped result matches the edit even
  // when the replica read is mocked or lags.
  for (const [key, value] of Object.entries(peopleUpdates)) {
    if (QUEUED_COLUMNS.has(key)) person[key] = value;
  }
  return { route: 'queued', person, columns: peopleUpdates };
}
