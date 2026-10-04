import { replicatedArmbandsTable } from '@/services/replication/ReplicatedArmbandsTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { buildClassPlacement, type ClassPlacement } from './showMapHandPlacement';

/** Replicated read (works offline). The panel and the mutation both call this. */
export async function loadClassPlacement(showId: string, classId: string): Promise<ClassPlacement> {
  const [entries, armbands] = await Promise.all([
    replicatedEntriesTable.getEntriesByClass(classId),
    replicatedArmbandsTable.getByShow(showId),
  ]);
  return buildClassPlacement(entries, armbands);
}
