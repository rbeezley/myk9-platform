import type { SyncMetadata } from '@myk9/replication';
import { replicatedEntriesTable } from './ReplicatedEntriesTable';

/** The one method this check needs, so a test can hand it a real table. */
export interface ScopedSyncMetadataReader {
  getSyncMetadata(scopeValue?: string): Promise<SyncMetadata | null>;
}

/**
 * Has this show's `entries` scope completed a sync on this device?
 *
 * `entries` replicates PER SHOW, and several single-row writes legitimately
 * insert into a scope that has never synced (`allowColdInsert`: write-path
 * hydration, the secretary lifecycle write, the move-up pair, a local create).
 * The row count therefore cannot say whether a show is loaded: after one
 * check-in on a fresh device the store holds exactly one row for the show
 * (MYK9-746). Only the sync download records the scope's row count, and
 * `projectScopedMetadata` drops `totalRows` for a scope that has never synced,
 * which makes it the discriminator. `clearCache()` resets every scope.
 *
 * A metadata read that fails or times out answers `false`: the caller then
 * treats the show as cold and verifies online, which is the safe side.
 */
export async function hasShowEntriesSynced(
  showId: string,
  table: ScopedSyncMetadataReader = replicatedEntriesTable
): Promise<boolean> {
  const metadata = await table.getSyncMetadata(showId);
  return metadata?.totalRows !== undefined;
}

/**
 * Do these rows come only from shows whose entries scope has synced?
 *
 * For a read keyed below the show (a class, a trial) that cannot name the show
 * up front: every such scope sits inside one show, so the rows it found name
 * the show to check. A row with no show id cannot be proven synced. No rows is
 * vacuously true; the empty-result verification covers that case.
 */
export async function areEntryRowsFromSyncedShows(
  rows: readonly { showId?: string | null | undefined }[],
  table: ScopedSyncMetadataReader = replicatedEntriesTable
): Promise<boolean> {
  const showIds = [...new Set(rows.map(row => row.showId ?? null))];
  const synced = await Promise.all(
    showIds.map(showId => (showId ? hasShowEntriesSynced(showId, table) : false))
  );
  return synced.every(Boolean);
}
