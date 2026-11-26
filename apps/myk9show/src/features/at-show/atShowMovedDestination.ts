import { replicatedClassesTable, replicatedEntriesTable } from '@/services/replication';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { composeClassTitle } from '@/services/entryDisplay/entryDisplaySelectors';

const isMoved = (re: ReplicatedEntry) =>
  (re.entryStatus ?? re.entry_status ?? re.status)?.trim().toLowerCase() === 'moved';

/**
 * For each `moved` entry in `rawEntries`, the name of the class the dog went to, keyed by the
 * moved entry's id, so Ringside's badge reads "Moved to {class}" (MYK9-1940). The destination is
 * the live entry whose `moved_from_entry_id` names the moved one. Read from the replica, so it
 * works offline. A dog with no findable destination is left out and the badge reads "Moved".
 */
export async function resolveMovedDestinationNames(
  rawEntries: readonly ReplicatedEntry[],
  showId: string
): Promise<Map<string, string>> {
  const moved = rawEntries.filter(isMoved);
  const names = new Map<string, string>();
  if (moved.length === 0) return names;

  const showEntries = await replicatedEntriesTable.getEntriesByShow(showId);
  const movedIds = new Set(moved.map(re => re.id));
  const destinationBySource = new Map<string, ReplicatedEntry>();
  for (const candidate of showEntries) {
    if (candidate.deletedAt ?? candidate.deleted_at) continue;
    const sourceId = candidate.movedFromEntryId ?? candidate.moved_from_entry_id;
    if (sourceId && movedIds.has(sourceId)) destinationBySource.set(sourceId, candidate);
  }

  for (const [sourceId, destination] of destinationBySource) {
    const classId = destination.classId ?? destination.class_id;
    const cls = classId ? await replicatedClassesTable.getClassById(classId) : null;
    if (!cls) continue;
    const name = composeClassTitle({
      element: cls.element ?? null,
      level: cls.level ?? null,
      section: cls.section ?? null,
    });
    if (name) names.set(sourceId, name);
  }
  return names;
}
