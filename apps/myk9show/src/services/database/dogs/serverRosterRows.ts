/**
 * The server roster read, without the PostgREST embeds (MYK9-1303).
 *
 * `owner:people(...)` and `registrations:dog_registrations(*)` made PostgREST
 * run a `row_to_json` and a `json_agg` subquery per dog, about 1 s a call under
 * load. The dogs are read as plain rows instead and the owners and registrations
 * come from the batched id lookups the device path already uses. The row this
 * returns has the shape the embeds gave `mapDatabaseToDog`: `owner` (the people
 * row, or null) and `registrations`, plus the same display flags the device path
 * sets so a read that could not finish says so.
 */
export interface RosterOwners {
  map: ReadonlyMap<string, unknown>;
  /** Device-remembered display names for owners that could not be read (MYK9-1189). */
  recalled: ReadonlyMap<string, string>;
  readFailed: boolean;
}

/** Registration rows grouped by dog, as the embed returned them (no de-duplication, no merge with the device). */
export function groupRegistrationsByDog(
  rows: readonly Record<string, unknown>[]
): Map<string, Record<string, unknown>[]> {
  const byDog = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const dogId = String(row.dog_id);
    const list = byDog.get(dogId);
    if (list) list.push(row);
    else byDog.set(dogId, [row]);
  }
  return byDog;
}

export function attachRosterRelations(
  dogs: Record<string, unknown>[],
  registrationsByDog: ReadonlyMap<string, Record<string, unknown>[]>,
  owners?: RosterOwners
): Record<string, unknown>[] {
  return dogs.map(dog => {
    const row: Record<string, unknown> = { ...dog };
    if (owners) {
      const ownerId = typeof dog.owner_id === 'string' ? dog.owner_id : undefined;
      const owner = ownerId ? (owners.map.get(ownerId) ?? null) : null;
      const recalledName = ownerId && !owner ? owners.recalled.get(ownerId) : undefined;
      row.owner = owner;
      if (recalledName) row.owner_display_name = recalledName;
      else if (owners.readFailed && ownerId && !owner) row.owner_unavailable_offline = true;
    }
    row.registrations = registrationsByDog.get(String(dog.id)) ?? [];
    return row;
  });
}
