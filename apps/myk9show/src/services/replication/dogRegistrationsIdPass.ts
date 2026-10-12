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
import { DOG_REGISTRATIONS_PAGE_SIZE, type ReplicatedDogRegistration } from './dogRegistrationRows';

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

/**
 * Remove local registrations the server no longer shows this account, in ONE
 * IndexedDB transaction over the replica and both mutation queues, so no write
 * from this tab or another can land between the check and the delete (the
 * same rule as the package's `deleteRowsIfClean`, MYK9-922). A row is kept when:
 *
 * - it was written after the pass began (revision differs from `snapshot`, or
 *   it is not in the snapshot at all);
 * - it is dirty, or a pending or failed mutation names it;
 * - it is a `_localOnly` placeholder whose dog has not reached the server: the
 *   dog's replica row is dirty or `_localOnly`, or a pending or failed `dogs`
 *   mutation names it. Once the dog has uploaded, the server holds its
 *   registrations under server ids, so the placeholder goes.
 *
 * Failed mutations of every user count: keeping a row is the safe error.
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

  const tx = db.transaction(
    [
      REPLICATION_STORES.REPLICATED_TABLES,
      REPLICATION_STORES.PENDING_MUTATIONS,
      REPLICATION_STORES.FAILED_MUTATIONS,
    ],
    'readwrite'
  );
  const rows = tx.objectStore(REPLICATION_STORES.REPLICATED_TABLES);
  const pending = tx.objectStore(REPLICATION_STORES.PENDING_MUTATIONS).index('tableName_rowId');
  const failed = tx.objectStore(REPLICATION_STORES.FAILED_MUTATIONS).index('tableName');
  const failedIds = async (table: string) =>
    new Set(((await failed.getAll(table)) as PendingMutation[]).map(m => String(m.rowId)));
  const failedRegistrations = await failedIds(tableName);
  const failedDogs = await failedIds(DOGS_TABLE);

  // The dog's own row counts as well as its queue: an offline create writes
  // the dog dirty before it queues the upload, so between the two there is
  // no dogs mutation yet but the dog has not reached the server either.
  const dogHoldsLocalWork = async (dogId: string): Promise<boolean> => {
    const dog = (await rows.get([DOGS_TABLE, dogId])) as
      ReplicatedRow<{ _localOnly?: boolean }> | undefined;
    return (
      dog?.isDirty === true ||
      dog?.data?._localOnly === true ||
      failedDogs.has(dogId) ||
      (await pending.count([DOGS_TABLE, dogId])) > 0
    );
  };

  for (const id of candidates) {
    const row = (await rows.get([tableName, id])) as
      ReplicatedRow<ReplicatedDogRegistration> | undefined;
    if (!row) continue;
    const ownWork =
      row.version !== snapshot.get(id) ||
      row.isDirty ||
      failedRegistrations.has(id) ||
      (await pending.count([tableName, id])) > 0;
    const dogId = String(row.data?.dogId ?? '');
    const placeholderAwaitingDog =
      row.data?._localOnly === true && (await dogHoldsLocalWork(dogId));
    if (ownWork || placeholderAwaitingDog) {
      result.kept.push(id);
    } else {
      await rows.delete([tableName, id]);
      result.deleted.push(id);
    }
  }

  await tx.done;
  return result;
}
