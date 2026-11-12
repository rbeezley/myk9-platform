import { toast } from 'sonner';
import { replicatedEntriesTable } from '@/services/replication';
import { logger } from '@/services/LoggingService';

/**
 * MYK9-1880: a Pull's Undo may only put back the status the Pull replaced while that Pull is
 * still the dog's current state. Without this a still-visible Undo overwrote whatever another
 * operator set after the Pull (checked-in, in-ring, completed, a second Pull).
 *
 * "Same Pull" is two things, both read without leaving the replicated layer:
 *  - this device's Pull token: a later Pull offered for the same entry replaces it, so an older
 *    toast's Undo is dead;
 *  - the replica row's check-in status at write time: it must still be 'pulled'. An exhibitor's
 *    Pull goes through the online-only RPC and may not have reached the replica yet, so for that
 *    writer the replica still showing the prior status also counts as "nothing newer seen".
 * Not detectable here: another device pulling the dog again with no other status visible in
 * between. That needs an expected-status check in `self_checkin_entry` (filed separately).
 */
const latestPullToken = new Map<string, number>();
let nextToken = 0;

/** Record a new Pull for the entry; returns the token its Undo must still hold. */
export function registerPull(entryId: string): number {
  nextToken += 1;
  latestPullToken.set(entryId, nextToken);
  return nextToken;
}

async function currentReplicaStatus(entryId: string): Promise<string | null> {
  try {
    const row = await replicatedEntriesTable.getEntryById(entryId);
    if (!row) return null;
    return row.checkInStatus ?? row.check_in_status ?? null;
  } catch (error) {
    logger.error('[at-show] pull undo status read failed', 'at-show', { error: String(error) });
    return null;
  }
}

export interface PullUndoRequest {
  entryId: string;
  token: number;
  priorStatus: string;
  callName: string;
  /** True for the exhibitor writer, whose Pull may not be in the replica yet. */
  replicaMayLag: boolean;
  restore: () => void | Promise<void>;
}

/** Restore the prior status only if the Pull is still current; otherwise write nothing and say so. */
export async function undoPullIfCurrent(request: PullUndoRequest): Promise<boolean> {
  const { entryId, token, priorStatus, callName, replicaMayLag, restore } = request;
  const status = await currentReplicaStatus(entryId);
  const supersededHere = latestPullToken.get(entryId) !== token;
  const supersededElsewhere =
    status !== null && status !== 'pulled' && !(replicaMayLag && status === priorStatus);
  if (supersededHere || supersededElsewhere) {
    toast.info(`${callName}'s status changed after the Pull, so Undo did nothing.`);
    return false;
  }
  await restore();
  return true;
}
