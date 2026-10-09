import { replicatedShowDeskPeopleTable } from '@/services/replication/ReplicatedShowDeskPeopleTable';

/**
 * Overlays of this device's UNSENT writes onto the dog read's PostgREST data
 * (MYK9-1071). The readers stay online; these only make a queued edit visible
 * before it uploads, and never read a row the server already has from the
 * replica (so a server-side delete cannot reappear).
 */

/** Replace a server registration with the queued local edit of the same id. */
export function overlayPendingRegistrationEdits(
  map: Map<string, Record<string, unknown>[]>,
  unsentRows: Record<string, unknown>[]
): void {
  const byId = new Map(unsentRows.map(row => [row.id, row]));
  for (const [dogId, rows] of map) {
    if (rows.some(row => byId.has(row.id))) {
      map.set(
        dogId,
        rows.map(row => (byId.has(row.id) ? { ...row, ...byId.get(row.id)! } : row))
      );
    }
  }
}

/** The owner columns the dog roster reads. */
export interface OwnerOverlayRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
}

/**
 * Apply queued person edits to the roster's owners. An owner the server read
 * did not return (offline) is filled from a pending edit only. An unreadable
 * replica overlays nothing.
 */
export async function overlayPendingOwners(
  owners: Map<string, OwnerOverlayRow>,
  ownerIds: string[]
): Promise<Map<string, OwnerOverlayRow>> {
  let pending;
  try {
    pending = (await replicatedShowDeskPeopleTable.getPeopleByIds(ownerIds)).filter(
      person => person._syncStatus === 'pending'
    );
  } catch {
    return owners;
  }
  for (const person of pending) {
    owners.set(person.id, {
      email: owners.get(person.id)?.email ?? person.email ?? null,
      id: person.id,
      first_name: person.firstName,
      last_name: person.lastName,
      phone: person.phone ?? null,
      street_address: person.address ?? null,
      city: person.city ?? null,
      state: person.state ?? null,
      zip_code: person.zipCode ?? null,
    });
  }
  return owners;
}
