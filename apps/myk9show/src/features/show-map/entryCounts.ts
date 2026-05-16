export type CatalogEntryLike = {
  deleted_at?: unknown;
  deletedAt?: unknown;
  /** Present in DB rows, intentionally not filtered: catalog rosters include terminal statuses. */
  entry_status?: unknown;
};

/** Counts the show catalog roster: every non-deleted entry, regardless of lifecycle status. */
export function countCatalogEntries(entries: readonly CatalogEntryLike[]): number {
  return entries.filter(entry => !entry.deleted_at && !entry.deletedAt).length;
}
