/**
 * The one answer to "what is this dog's armband in this show?" (MYK9-976).
 *
 * `entries.armband` wins when set. It is cleared on a withdrawn row while the
 * show's `armbands` row (one per dog per show) keeps the number, so a surface
 * that read only the entry column showed a withdrawn dog with no number while
 * the class page, which falls back to the armbands table, showed it.
 * Order: the entry's own column, the armband assigned to that entry, then the
 * armband assigned to the dog in this show.
 */
export interface ArmbandAssignment {
  armbandNumber: string;
  entryId?: string | null | undefined;
  dogId?: string | null | undefined;
  isAvailable?: boolean | null | undefined;
}

export interface ShowArmbandMaps<T extends ArmbandAssignment = ArmbandAssignment> {
  byEntryId: ReadonlyMap<string, T>;
  byDogId: ReadonlyMap<string, T>;
}

/** Index a show's assigned (not available) armbands by entry and by dog. */
export function buildShowArmbandMaps<T extends ArmbandAssignment>(
  armbands: readonly T[]
): ShowArmbandMaps<T> {
  const assigned = armbands.filter(armband => armband.isAvailable !== true);
  const byEntryId = new Map<string, T>();
  const byDogId = new Map<string, T>();
  for (const armband of assigned) {
    if (armband.entryId) byEntryId.set(armband.entryId, armband);
    if (armband.dogId) byDogId.set(armband.dogId, armband);
  }
  return { byEntryId, byDogId };
}

export function resolveEntryArmband(
  entry: { id: string; dogId?: string | null | undefined; armband?: string | null | undefined },
  maps: ShowArmbandMaps
): string | null {
  return (
    entry.armband ??
    maps.byEntryId.get(entry.id)?.armbandNumber ??
    (entry.dogId ? maps.byDogId.get(entry.dogId)?.armbandNumber : undefined) ??
    null
  );
}
