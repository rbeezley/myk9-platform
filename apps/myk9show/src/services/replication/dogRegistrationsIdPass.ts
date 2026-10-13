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
  hasServerTwin,
  indexServerTwins,
  type ReplicatedDogRegistration,
} from './dogRegistrationRows';

/** The replica's IndexedDB handle (`ReplicatedTable.init()`). */
type ReplicaDb = Awaited<ReturnType<DatabaseManager['getDatabase']>>;

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

/**
 * Each local row's revision (`ReplicatedRow.version`, bumped by every local
 * write), taken BEFORE the first id page is requested. A row absent from the
 * snapshot, or whose revision moved, was written after the pass began and is
 * never removed by it: the id set may predate that write.
 */
export async function snapshotRegistrationRevisions(
  db: ReplicaDb,
  tableName: string
): Promise<Map<string, number>> {
  const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
  const rows = (await tx.store
    .index('tableName')
    .getAll(tableName)) as ReplicatedRow<ReplicatedDogRegistration>[];
  await tx.done;
  return new Map(rows.map(row => [String(row.id), row.version]));
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
 * - it was written after the pass began (revision differs from `snapshot`, or
 *   it is not in the snapshot at all);
 * - it is dirty, or a pending or failed mutation names it;
 * - it is a `_localOnly` placeholder. The server gives its copy a new id, so
 *   the id set says nothing about a placeholder; `removeResolvedPlaceholders`
 *   decides by content instead.
 */
export async function pruneRegistrationsMissingFromServer(
  db: ReplicaDb,
  tableName: string,
  serverIds: ReadonlySet<string>,
  snapshot: ReadonlyMap<string, number>
): Promise<{ deleted: string[]; kept: string[] }> {
  const result = { deleted: [] as string[], kept: [] as string[] };
  const candidates = [...snapshot.keys()].filter(id => !serverIds.has(id));
  if (candidates.length === 0) return result;

  const { tx, rows, pending, failedRowIds } = await openRemovalTransaction(db);
  const failed = await failedRowIds(tableName);

  for (const id of candidates) {
    const row = (await rows.get([tableName, id])) as
      ReplicatedRow<ReplicatedDogRegistration> | undefined;
    if (!row) continue;
    const keep =
      row.data?._localOnly === true ||
      row.version !== snapshot.get(id) ||
      row.isDirty ||
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
 * Remove offline-created placeholders that are resolved, judged by content and
 * never by timing (Codex review rounds 4 and 5: every timing guard had a
 * window). In ONE IndexedDB transaction over the replica and both mutation
 * queues, run after the sync has stored the downloaded rows, a clean
 * `_localOnly` placeholder with no queued work of its own is removed when:
 *
 * - its server twin is here: a clean server row with the same dog and
 *   creation instant, or the same organization and number when the
 *   placeholder has no usable `created_at` (`hasServerTwin`); or
 * - it is an orphan: its dog is no longer in the dogs replica and no pending
 *   or failed `dogs` mutation names that dog (the create was discarded, or
 *   the RPC mapped it onto an existing dog).
 *
 * Otherwise it stays, including after its dog uploaded but before the
 * server's copies arrived: offline, it is the device's only copy.
 */
export async function removeResolvedPlaceholders(
  db: ReplicaDb,
  tableName: string
): Promise<string[]> {
  const { tx, rows, pending, failedRowIds } = await openRemovalTransaction(db);
  const all = (await rows
    .index('tableName')
    .getAll(tableName)) as ReplicatedRow<ReplicatedDogRegistration>[];
  const failedRegistrations = await failedRowIds(tableName);
  const failedDogs = await failedRowIds(DOGS_TABLE);
  const twins = indexServerTwins(
    all.filter(row => !row.isDirty && row.data?._localOnly !== true).map(row => row.data)
  );

  const deleted: string[] = [];
  for (const row of all) {
    if (row.data?._localOnly !== true || row.isDirty || failedRegistrations.has(row.id)) continue;
    if ((await pending.count([tableName, row.id])) > 0) continue;
    const dogId = String(row.data.dogId);
    const orphan =
      !(await rows.get([DOGS_TABLE, dogId])) &&
      !failedDogs.has(dogId) &&
      (await pending.count([DOGS_TABLE, dogId])) === 0;
    if (hasServerTwin(row.data, twins) || orphan) {
      await rows.delete([tableName, row.id]);
      deleted.push(row.id);
    }
  }

  await tx.done;
  return deleted;
}
