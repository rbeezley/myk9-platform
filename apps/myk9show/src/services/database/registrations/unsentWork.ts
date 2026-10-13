/**
 * This device's unsent registration work for a server-first read (MYK9-1090),
 * after applying what the read proves: a server row with the id of a
 * device-only add means that add landed (Codex round 3), so it is marked
 * server-backed in the replica (`markServerBacked`) before the merge. A
 * device that cannot be read throws, so each caller decides what that costs;
 * a failed mark only leaves the rows as they were.
 */
import {
  replicatedDogRegistrationsTable,
  type ReplicatedDogRegistration,
} from '@/services/replication/ReplicatedDogRegistrationsTable';

export async function unsentWorkProvenByServer(
  dogIds: string[],
  serverRows: readonly Record<string, unknown>[] | null | undefined
): Promise<ReplicatedDogRegistration[]> {
  const unsent = await replicatedDogRegistrationsTable.getUnsentWorkForDogs(dogIds);
  const serverIds = new Map(
    (serverRows ?? []).map(row => [
      String(row.id),
      typeof row.version === 'number' ? row.version : undefined,
    ])
  );
  const proven = new Map(
    unsent
      .filter(row => row._queuedAdd === true && serverIds.has(row.id))
      .map(row => [row.id, serverIds.get(row.id)])
  );
  if (proven.size === 0) return unsent;
  try {
    await replicatedDogRegistrationsTable.markServerBacked(proven);
  } catch {
    return unsent;
  }
  return replicatedDogRegistrationsTable.getUnsentWorkForDogs(dogIds);
}
