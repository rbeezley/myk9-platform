import { queryKeys } from '@/lib/queryClient';
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

/** Query key of the panel's placement read; the write awaits its refresh. */
export const classPlacementKey = (showId: string, classId: string) =>
  [...queryKeys.classEntries(classId), 'placement', showId] as const;
