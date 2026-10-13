/**
 * The `dog_registrations` ID pass (MYK9-1090, plan §1).
 *
 * The incremental changes pass only sees rows whose `updated_at` moved. It
 * cannot see a registration that left this account's view (hard delete, its
 * dog soft-deleted, which RLS hides through `dog_deleted_at`, or the dog
 * changing hands), nor one that came INTO view without an edit (its dog gained
 * a co-owner). The ID pass reads every visible id and closes both gaps.
 */
import {
  REPLICATION_STORES,
  type DatabaseManager,
  type PendingMutation,
  type ReplicatedRow,
} from '@myk9/replication';
import { supabase } from '@/services/database/supabaseClient';
import {
  DOG_REGISTRATIONS_PAGE_SIZE,
  asServerBacked,
  indexServerTwins,
  isPlaceholder,
  resolvedPlaceholderIds,
  type ReplicatedDogRegistration,
  type TwinFields,
} from './dogRegistrationRows';

/** The replica's IndexedDB handle (`ReplicatedTable.init()`). */
type ReplicaDb = Awaited<ReturnType<DatabaseManager['getDatabase']>>;

/** Outcome of one ID pass; `null` from `reconcileWithServerIds` means it was skipped. */
export interface RegistrationIdPassResult {
  removed: number;
  fetched: number;
}

/** Bound on the id loop: 100 pages is 100,000 registrations. */
export const DOG_REGISTRATION_ID_PASS_MAX_PAGES = 100;

/**
 * Every registration id this session can read, keyset-paged on the primary
 * key (offset pages skip or repeat rows under concurrent writes). `null` when
 * any page fails or the page cap is reached: an incomplete id set must never
 * drive a removal.
 */
export async function fetchVisibleRegistrationIds(): Promise<Set<string> | null> {
  const ids = new Set<string>();
  let lastId: string | undefined;

  for (let page = 0; page < DOG_REGISTRATION_ID_PASS_MAX_PAGES; page++) {
    let query = supabase.from('dog_registrations').select('id');
    if (lastId !== undefined) query = query.gt('id', lastId);
    const { data, error } = await query
      .order('id', { ascending: true })
      .limit(DOG_REGISTRATIONS_PAGE_SIZE);
    if (error || !data) return null;

    for (const row of data) ids.add(String((row as { id: string }).id));
    if (data.length < DOG_REGISTRATIONS_PAGE_SIZE) return ids;
    lastId = String((data[data.length - 1] as { id: string }).id);
  }
  return null;
}

/** The device rows as they stood before the first id page was requested. */
export interface RegistrationSnapshot {
  /** Each row's revision (`ReplicatedRow.version`, bumped by every local write). */
  revisions: Map<string, number>;
  /** Rows a pending or failed mutation named when the pass began. */
  queued: Set<string>;
}

/**
 * Each local row's revision, and the rows queued work named, taken BEFORE the
 * first id page is requested. A row absent from the snapshot, or whose
 * revision moved, was written after the pass began and is never removed by
 * it: the id set may predate that write. Nor is a row that had queued work
 * when the pass began: its upload may be acknowledged mid-pass, which marks a
 * queued add synced without moving its revision, while the id set predates
 * the INSERT (MYK9-1129 item b). The next pass decides those.
 */
export async function snapshotRegistrationRevisions(
  db: ReplicaDb,
  tableName: string
): Promise<RegistrationSnapshot> {
  const tx = db.transaction(
    [
      REPLICATION_STORES.REPLICATED_TABLES,
      REPLICATION_STORES.PENDING_MUTATIONS,
      REPLICATION_STORES.FAILED_MUTATIONS,
    ],
    'readonly'
  );
  const rows = (await tx
    .objectStore(REPLICATION_STORES.REPLICATED_TABLES)
    .index('tableName')
    .getAll(tableName)) as ReplicatedRow<ReplicatedDogRegistration>[];
  const queued = await Promise.all(
    [REPLICATION_STORES.PENDING_MUTATIONS, REPLICATION_STORES.FAILED_MUTATIONS].map(
      async store =>
        (await tx.objectStore(store).index('tableName').getAll(tableName)) as PendingMutation[]
    )
  );
  await tx.done;
  return {
    revisions: new Map(rows.map(row => [String(row.id), row.version])),
    queued: new Set(queued.flat().map(mutation => String(mutation.rowId))),
  };
}

const DOGS_TABLE = 'dogs';

/** The open transaction's stores the two removal passes read. */
async function openRemovalTransaction(db: ReplicaDb) {
  const tx = db.transaction(
    [
      REPLICATION_STORES.REPLICATED_TABLES,
      REPLICATION_STORES.PENDING_MUTATIONS,
      REPLICATION_STORES.FAILED_MUTATIONS,
    ],
    'readwrite'
  );
  const failed = tx.objectStore(REPLICATION_STORES.FAILED_MUTATIONS).index('tableName');
  return {
    tx,
    rows: tx.objectStore(REPLICATION_STORES.REPLICATED_TABLES),
    pending: tx.objectStore(REPLICATION_STORES.PENDING_MUTATIONS).index('tableName_rowId'),
    // Failed mutations of every user count: keeping a row is the safe error.
    failedRowIds: async (table: string) =>
      new Set(((await failed.getAll(table)) as PendingMutation[]).map(m => String(m.rowId))),
  };
}

/**
 * Remove local registrations the server no longer shows this account, in ONE
 * IndexedDB transaction over the replica and both mutation queues, so no write
 * from this tab or another can land between the check and the delete (the
 * same rule as the package's `deleteRowsIfClean`, MYK9-922). A row is kept when:
 *
 * - it was written after the pass began (see `snapshotRegistrationRevisions`);
 * - a pending or failed mutation names it;
 * - it is dirty, unless it is a delete nothing names any more (its DELETE
 *   uploaded and the server agrees it is gone);
 * - it is `_localOnly`: a placeholder's server copy has a new id, so the id
 *   set says nothing about it (`removeResolvedPlaceholders` decides by
 *   content), and a queued add is named by its INSERT.
 */
export async function pruneRegistrationsMissingFromServer(
  db: ReplicaDb,
  tableName: string,
  serverIds: ReadonlySet<string>,
  snapshot: RegistrationSnapshot
): Promise<{ deleted: string[]; kept: string[] }> {
  const result = { deleted: [] as string[], kept: [] as string[] };
  const candidates = [...snapshot.revisions.keys()].filter(id => !serverIds.has(id));
  if (candidates.length === 0) return result;

  const { tx, rows, pending, failedRowIds } = await openRemovalTransaction(db);
  const failed = await failedRowIds(tableName);

  for (const id of candidates) {
    const row = (await rows.get([tableName, id])) as
      ReplicatedRow<ReplicatedDogRegistration> | undefined;
    if (!row) continue;
    const keep =
      row.data?._localOnly === true ||
      row.version !== snapshot.revisions.get(id) ||
      snapshot.queued.has(id) ||
      (row.isDirty && row.data?._pendingDelete !== true) ||
      failed.has(id) ||
      (await pending.count([tableName, id])) > 0;
    if (keep) {
      result.kept.push(id);
    } else {
      await rows.delete([tableName, id]);
      result.deleted.push(id);
    }
  }

  await tx.done;
  return result;
}

/**
 * Mark device-only adds the server has shown it holds (`asServerBacked`), in
 * one transaction. `seen` maps each server row id to its version when known;
 * a known version becomes the row's server token. Called by the changes pass,
 * the ID pass and the server-first readers. Returns the ids it changed.
 */
export async function markServerBacked(
  db: ReplicaDb,
  tableName: string,
  seen: ReadonlyMap<string, number | undefined>
): Promise<string[]> {
  if (seen.size === 0) return [];
  const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
  const changed: string[] = [];
  for (const [id, version] of seen) {
    const row = (await tx.store.get([tableName, id])) as
      ReplicatedRow<ReplicatedDogRegistration> | undefined;
    if (!row?.data || (row.data._localOnly !== true && row.data._queuedAdd !== true)) continue;
    if (row.data._localOnly === true && isPlaceholder(row.data)) continue;
    await tx.store.put({
      ...row,
      data: asServerBacked(row.data),
      ...(version !== undefined ? { serverVersion: version } : {}),
    });
    changed.push(id);
  }
  await tx.done;
  return changed;
}

/**
 * Remove rows whose queued DELETE the server just confirmed (MYK9-1075): a row
 * still marked `_pendingDelete` that no other pending or failed mutation names.
 * One transaction, as above. Returns the removed rows, so their placeholders
 * can go with them.
 */
export async function removeConfirmedDeletes(
  db: ReplicaDb,
  tableName: string,
  ids: readonly string[]
): Promise<ReplicatedDogRegistration[]> {
  if (ids.length === 0) return [];
  const { tx, rows, pending, failedRowIds } = await openRemovalTransaction(db);
  const failed = await failedRowIds(tableName);
  const removed: ReplicatedDogRegistration[] = [];
  for (const id of ids) {
    const row = (await rows.get([tableName, id])) as
      ReplicatedRow<ReplicatedDogRegistration> | undefined;
    if (row?.data?._pendingDelete !== true || failed.has(id)) continue;
    if ((await pending.count([tableName, id])) > 0) continue;
    await rows.delete([tableName, id]);
    removed.push(row.data);
  }
  await tx.done;
  return removed;
}

/**
 * Remove offline-created placeholders that are resolved, judged by content and
 * never by timing (Codex review rounds 4 and 5: every timing guard had a
 * window). In ONE IndexedDB transaction over the replica and both mutation
 * queues, run after the sync has stored the downloaded rows, a clean
 * `_localOnly` placeholder with no queued work of its own is removed when:
 *
 * - it is resolved (`resolvedPlaceholderIds`): a server row on the same dog
 *   with the same creation instant, or the same organization and number, is
 *   here (the number match also covers the RPC mapping the create onto an
 *   existing dog that already holds it), or a sibling from that same merged
 *   create is (the RPC inserted none of them, MYK9-1129); or
 * - it is an orphan: its dog is no longer in the dogs replica and no pending
 *   or failed `dogs` mutation names that dog (the create was discarded).
 *
 * Otherwise it stays, including after its dog uploaded but before the
 * server's copies arrived: offline, it is the device's only copy.
 *
 * `deletedOnServer` adds twins the device never held: a direct delete the
 * server just confirmed takes the deleted row's placeholder with it, or the
 * placeholder would outlive its twin and show the deleted registration again.
 */
export async function removeResolvedPlaceholders(
  db: ReplicaDb,
  tableName: string,
  deletedOnServer: readonly TwinFields[] = []
): Promise<string[]> {
  const { tx, rows, pending, failedRowIds } = await openRemovalTransaction(db);
  const all = (await rows
    .index('tableName')
    .getAll(tableName)) as ReplicatedRow<ReplicatedDogRegistration>[];
  const failedRegistrations = await failedRowIds(tableName);
  const failedDogs = await failedRowIds(DOGS_TABLE);
  // Every row with a server id counts as a twin, including one this device
  // is editing or deleting: its placeholder stands for that same registration.
  const twins = indexServerTwins([
    ...all.filter(row => row.data?._localOnly !== true).map(row => row.data),
    ...deletedOnServer,
  ]);
  const placeholders = all.filter(row => row.data && isPlaceholder(row.data));
  const resolved = resolvedPlaceholderIds(
    placeholders.map(row => row.data),
    twins
  );

  const deleted: string[] = [];
  for (const row of placeholders) {
    if (row.isDirty || failedRegistrations.has(row.id)) continue;
    if ((await pending.count([tableName, row.id])) > 0) continue;
    const dogId = String(row.data.dogId);
    const orphan =
      !(await rows.get([DOGS_TABLE, dogId])) &&
      !failedDogs.has(dogId) &&
      (await pending.count([DOGS_TABLE, dogId])) === 0;
    if (resolved.has(row.id) || orphan) {
      await rows.delete([tableName, row.id]);
      deleted.push(row.id);
    }
  }

  await tx.done;
  return deleted;
}
