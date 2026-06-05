import { moveUpShowMapEntry } from '@/features/show-map/showMapActionMutations';
import { replicatedEntriesTable } from '@/services/replication';
import { updateReplicatedDayOfScratch } from './checkInStatus';

interface ActionResult {
  error: Error | null;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Show-day request update failed');
}

export async function approveMoveUpRequestReplicated(
  entryId: string,
  targetClassId: string,
  reason?: string
): Promise<ActionResult> {
  try {
    await moveUpShowMapEntry({ entryId, targetClassId, reason });
    return { error: null };
  } catch (error) {
    return { error: toError(error) };
  }
}

export async function denyMoveUpRequestReplicated(
  entryId: string,
  reason?: string
): Promise<ActionResult> {
  const note = reason ? `Move-up denied: ${reason}` : 'Move-up request denied';

  try {
    await replicatedEntriesTable.updateEntry(entryId, {
      entryStatus: 'confirmed',
      entry_status: 'confirmed',
      specialRequests: note,
      special_requests: note,
    });
    return { error: null };
  } catch (error) {
    return { error: toError(error) };
  }
}

export async function approvePullRequestReplicated(entryId: string): Promise<ActionResult> {
  try {
    await updateReplicatedDayOfScratch(entryId, 'Pull approved');
    return { error: null };
  } catch (error) {
    return { error: toError(error) };
  }
}

export async function denyPullRequestReplicated(
  entryId: string,
  reason?: string
): Promise<ActionResult> {
  const note = reason ? `Pull denied: ${reason}` : 'Pull request denied';

  try {
    await replicatedEntriesTable.updateEntry(entryId, {
      entryStatus: 'confirmed',
      entry_status: 'confirmed',
      specialRequests: note,
      special_requests: note,
    });
    return { error: null };
  } catch (error) {
    return { error: toError(error) };
  }
}
