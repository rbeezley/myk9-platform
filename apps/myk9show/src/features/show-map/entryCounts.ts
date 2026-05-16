export type CatalogEntryLike = {
  deleted_at?: unknown;
  deletedAt?: unknown;
  entry_status?: unknown;
};

export function countCatalogEntries(entries: readonly CatalogEntryLike[]): number {
  return entries.filter(entry => !entry.deleted_at && !entry.deletedAt).length;
}
