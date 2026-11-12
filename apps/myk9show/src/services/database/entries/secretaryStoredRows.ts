import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { toSecretaryEntry } from './secretaryReadReplication';
import type { SecretaryEntry } from './secretaryTypes';

/** The columns a desk write (check-in, Pull, Undo, Put back, Clear flag) can change on an entry. */
const STORED_WRITE_FIELDS = [
  'entry_status',
  'check_in_status',
  'check_in_pulled_by',
  'withdrawal_reason',
  'special_requests',
  'updated_at',
] as const satisfies readonly (keyof SecretaryEntry)[];

/**
 * The entries a write just stored, read back from the replica by id (the write lands there
 * before it uploads) and mapped by the same `toSecretaryEntry` as the show read. Relations other
 * than the entry's own class are left empty, so only the write columns of the result
 * (`STORED_WRITE_FIELDS`) are meaningful; `mergeStoredSecretaryEntries` takes just those. An id
 * the replica cannot give back is left out: the caller keeps what it has and the re-read decides.
 */
export async function readStoredSecretaryRows(
  entryIds: readonly string[]
): Promise<SecretaryEntry[]> {
  const rows = await Promise.all(
    [...new Set(entryIds)].map(async entryId => {
      try {
        const entry = await replicatedEntriesTable.getEntryById(entryId);
        if (!entry) return null;
        const cls = entry.classId ? await replicatedClassesTable.get(entry.classId) : null;
        return toSecretaryEntry(entry, {
          dogsMap: new Map(),
          classesMap: cls ? new Map([[cls.id, cls]]) : new Map(),
          armbandsByEntryId: new Map(),
          armbandsByDogId: new Map(),
          peopleMap: new Map(),
          enrollmentsMap: new Map(),
          trialsMap: new Map(),
          pullMetadataMap: new Map(),
        });
      } catch {
        return null;
      }
    })
  );
  return rows.filter((row): row is SecretaryEntry => row !== null);
}

/** `current` with the write columns of each stored row taken, so one write never reads as undone. */
export function mergeStoredSecretaryEntries(
  current: readonly SecretaryEntry[],
  stored: readonly SecretaryEntry[]
): SecretaryEntry[] {
  const byId = new Map(stored.map(row => [row.id, row]));
  return current.map(entry => {
    const row = byId.get(entry.id);
    if (!row) return entry;
    const next = { ...entry };
    for (const field of STORED_WRITE_FIELDS) {
      Object.assign(next, { [field]: row[field] });
    }
    return next;
  });
}
