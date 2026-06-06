import { moveUpShowMapEntry } from '@/features/show-map/showMapActionMutations';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedEntriesTable } from '@/services/replication';
import { updateReplicatedDayOfScratch } from './checkInStatus';
import { logReplicatedEntryStatusChange } from './entryStatusAudit';

interface ActionResult {
  error: Error | null;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Show-day request update failed');
}

function readEntryStatus(entry: ReplicatedEntry): string | null {
  return entry.entryStatus ?? entry.entry_status ?? entry.status ?? null;
}

async function requireRequestStatus(entryId: string, expectedStatus: string): Promise<void> {
  const entry = await replicatedEntriesTable.getEntryById(entryId);
  if (!entry) {
    throw new Error(`Entry ${entryId} not found`);
  }

  const status = readEntryStatus(entry);
  if (status !== expectedStatus) {
    throw new Error(
      `Cannot process request for entry ${entryId}; expected ${expectedStatus}, got ${status ?? 'unknown'}`
    );
  }
}

export async function approveMoveUpRequestReplicated(
  entryId: string,
  targetClassId: string,
  reason?: string
): Promise<ActionResult> {
  try {
    await requireRequestStatus(entryId, 'move-up-requested');
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
    await requireRequestStatus(entryId, 'move-up-requested');
    await replicatedEntriesTable.updateEntry(entryId, {
      entryStatus: 'confirmed',
      entry_status: 'confirmed',
      moveUpRequested: false,
      move_up_requested: false,
      specialRequests: note,
      special_requests: note,
    });
    await logReplicatedEntryStatusChange({
      entryId,
      fromStatus: 'move-up-requested',
      toStatus: 'confirmed',
      action: 'deny_move_up_request',
      reason,
    });
    return { error: null };
  } catch (error) {
    return { error: toError(error) };
  }
}

export async function approvePullRequestReplicated(entryId: string): Promise<ActionResult> {
  try {
    await requireRequestStatus(entryId, 'scratch-requested');
    await updateReplicatedDayOfScratch(entryId, 'Pull approved', {
      auditAction: 'approve_scratch_request',
      fromStatus: 'scratch-requested',
    });
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
    await requireRequestStatus(entryId, 'scratch-requested');
    await replicatedEntriesTable.updateEntry(entryId, {
      entryStatus: 'confirmed',
      entry_status: 'confirmed',
      specialRequests: note,
      special_requests: note,
    });
    await logReplicatedEntryStatusChange({
      entryId,
      fromStatus: 'scratch-requested',
      toStatus: 'confirmed',
      action: 'deny_scratch_request',
      reason,
    });
    return { error: null };
  } catch (error) {
    return { error: toError(error) };
  }
}
