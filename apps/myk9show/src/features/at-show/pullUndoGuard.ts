import { toast } from 'sonner';
import { replicatedEntriesTable } from '@/services/replication';
import { logger } from '@/services/LoggingService';
import { isStaleCheckIn } from '@/services/show-day/checkInStatus';

/**
 * MYK9-1880: a Pull's Undo may only put back the status the Pull replaced while that Pull is
 * still the dog's current state. Without this a still-visible Undo overwrote whatever another
 * operator set after the Pull (checked-in, in-ring, completed, a second Pull).
 *
 * "Same Pull" is decided differently per writer:
 *  - Staff (`replicated` writer): the Pull is written durable-first to the replica before the
 *    toast shows, so the replica row is the truth. Undo needs this device's Pull token to be the
 *    latest AND the row's check-in status to still be 'pulled'.
 *  - Exhibitor (`self-checkin-rpc`, and every My Entries Pull): the RPC never touches the
 *    replicated store, so the replica row can be older than the status the screen holds.
 *    Consulting it would refuse a normal Undo, so it is not read at all. Only the per-device
 *    token decides: a later Pull on this device kills the older toast's Undo.
 * Not detectable client-side: another device changing or re-pulling the dog while an exhibitor's
 * Undo is showing. The server catches it (MYK9-1911): the exhibitor Undo write carries the status
 * and Pull source it expects to replace, `self_checkin_entry` refuses it when the row moved on,
 * and `restore` rejecting with that refusal gets the same notice as a client-side detection.
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

function notifyPullUndoSuperseded(callName: string): void {
  toast.info(`${callName}'s status changed after the Pull, so Undo did nothing.`);
}

export interface PullUndoRequest {
  entryId: string;
  token: number;
  callName: string;
  /** True when the Pull bypasses the replica (exhibitor RPC): the replica is not consulted. */
  replicaMayLag: boolean;
  restore: () => unknown;
}

/** Restore the prior status only if the Pull is still current; otherwise write nothing and say so. */
export async function undoPullIfCurrent(request: PullUndoRequest): Promise<boolean> {
  const { entryId, token, callName, replicaMayLag, restore } = request;
  const supersededHere = latestPullToken.get(entryId) !== token;
  const status = replicaMayLag || supersededHere ? null : await currentReplicaStatus(entryId);
  const supersededElsewhere = status !== null && status !== 'pulled';
  if (supersededHere || supersededElsewhere) {
    notifyPullUndoSuperseded(callName);
    return false;
  }
  try {
    await restore();
  } catch (error) {
    if (!isStaleCheckIn(error)) throw error;
    notifyPullUndoSuperseded(callName);
    return false;
  }
  return true;
}
