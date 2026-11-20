/**
 * The one rule for naming an entry's exhibitor and dog, shared by Entry Management
 * (`mapSecretaryEntryToEntryManagementEntry`) and the Refund all result lines (MYK9-1862).
 */

import { ownerNameCacheKey, recallOwnerNames } from '@/services/database/dogs/ownerNameCache';
import { useUserStore } from '@/store/userStore';
import type { User } from '@/types/user-types';

interface NamedPerson {
  first_name: string | null;
  last_name: string | null;
}

/** The fields the rule reads; a full `SecretaryEntry` and a slim by-id row both fit. */
export interface EntryDisplayNameSource {
  handler: string | null;
  dog: {
    name: string;
    call_name: string | null;
    owner: (NamedPerson & { id?: string | null }) | null;
  } | null;
}

/** "First Last" from a joined person record, or null when absent/blank. */
export function personName(person: NamedPerson | null | undefined): string | null {
  if (!person) return null;
  const name = `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim();
  return name || null;
}

/** Shown in the owner's place when the dog has an owner whose name is not on this device (MYK9-2256). */
export const OWNER_NAME_NOT_ON_DEVICE = 'Owner name not on this device';

/**
 * Online (webhook-created) entries set the dog's owner FK but never the legacy `handler` text;
 * mail-in entries set the text only.
 *
 * `ownerId` is the dog's owner id. With none, the entry has no owner record (a mail-in entry), so
 * the typed handler text is the only name there is and stays. With one, the handler text is never
 * the owner (it can be someone else): use the joined name, else the names-only device copy, else
 * say the name is not on this device.
 */
export function entryOwnerName(
  entry: EntryDisplayNameSource,
  ownerId: string | null | undefined = entry.dog?.owner?.id
): string {
  if (!ownerId) return personName(entry.dog?.owner) || entry.handler || 'Unknown';
  const joined = personName(entry.dog?.owner);
  if (joined) return joined;
  // The saved people directory (management devices only) is reloaded on every online
  // management boot, so it outranks the names-only device copy (MYK9-2265).
  const saved = savedOwnerName(ownerId, useUserStore.getState().users);
  if (saved) return saved;
  const remembered = recallOwnerNames([ownerId], ownerNameCacheKey()).get(ownerId);
  return personName(remembered) || OWNER_NAME_NOT_ON_DEVICE;
}

function savedOwnerName(ownerId: string, users: readonly User[]): string | null {
  const saved = users.find(person => person.id === ownerId);
  return personName({ first_name: saved?.firstName ?? null, last_name: saved?.lastName ?? null });
}

/**
 * Held entries whose owner name was "not on this device" when they were mapped, re-resolved
 * against the saved directory once it arrives (a cold offline boot rehydrates it after the
 * mapping). Returns the same array when nothing changes.
 */
export function withSavedOwnerNames<T extends { ownerId?: string | null; ownerName: string }>(
  entries: readonly T[],
  users: readonly User[]
): readonly T[] {
  if (users.length === 0) return entries;
  let changed = false;
  const next = entries.map(entry => {
    if (!entry.ownerId || entry.ownerName !== OWNER_NAME_NOT_ON_DEVICE) return entry;
    const name = savedOwnerName(entry.ownerId, users);
    if (!name) return entry;
    changed = true;
    return { ...entry, ownerName: name };
  });
  return changed ? next : entries;
}

/** The call name, else the registered name. */
export function entryDogName(entry: EntryDisplayNameSource): string {
  return entry.dog?.call_name || entry.dog?.name || 'Unknown Dog';
}

/** The registered name when the dog is shown by a different call name, else null. */
export function entryDogRegisteredName(entry: EntryDisplayNameSource): string | null {
  return entry.dog?.call_name && entry.dog?.name ? entry.dog.name : null;
}
