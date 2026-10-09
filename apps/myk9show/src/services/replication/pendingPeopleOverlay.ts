import { patchPersonRow } from '@/hooks/patchCachedPersonRows';
import { replicatedShowDeskPeopleTable } from './ReplicatedShowDeskPeopleTable';
import { personQueuedColumnValues } from './personRowMapping';

/**
 * Overlay queued (not yet uploaded) person edits onto rows read from PostgREST
 * (MYK9-1071). The people readers stay online; without this, any refetch between
 * a queued save and its upload (an online save's own invalidation, a reconnect)
 * would show, and a form would reset to, the old server values. Rows of people
 * with no pending edit are returned unchanged. An unreadable replica overlays
 * nothing.
 */
export async function overlayPendingPeople<T>(rows: T[]): Promise<T[]> {
  let pending;
  try {
    pending = (await replicatedShowDeskPeopleTable.getAllOrThrow()).filter(
      person => person._syncStatus === 'pending' && !person._localOnly
    );
  } catch {
    return rows;
  }
  if (pending.length === 0) return rows;
  return rows.map(row =>
    pending.reduce<unknown>(
      (current, person) => patchPersonRow(current, person.id, personQueuedColumnValues(person)),
      row
    )
  ) as T[];
}
