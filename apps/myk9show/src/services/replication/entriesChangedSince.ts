import { logger } from '@myk9/core';
import { features } from '@/config/features';
import { supabase } from '@/services/database/supabaseClient';

export const ENTRY_RESULTS_CHANGED_SINCE_RPC = 'entry_results_changed_since';

let warned = false;

/**
 * The last COMPLETED view read per show: the watermark W it was asked for
 * (since + buffer) and the wall-clock time it started.
 */
const lastViewRead = new Map<string, { watermark: number; readAt: number }>();

interface ReadWindow {
  showId: string;
  since: number;
  forceFullSync?: boolean;
  /** The buffer the engine subtracted from the watermark (ReplicatedEntriesTable's own constant). */
  bufferMs: number;
}

/**
 * MYK9-1369: ask the server whether anything the results view reads for this
 * show moved after the watermark, so a quiet poll skips the view read.
 *
 * Returns true ONLY when the server answered a definite `false`. Every other
 * outcome (flag off, full sync, no settled earlier read, RPC error or throw,
 * non-boolean) returns false so the caller reads the view as before; the
 * migration need not be applied for the app to keep working.
 *
 * Why skipping is no less safe than today's buffered re-read: the engine asks
 * for `updated_at > W - buffer` where W is the newest updated_at it has seen,
 * and an empty answer never moves W, so the row that set W is always inside the
 * window and the view is rebuilt every poll. The buffer exists to catch rows
 * that commit late with an older updated_at. A view read that STARTED at or
 * after W + buffer already covered (W - buffer, W] once any commit lag within
 * the buffer had settled, so asking again only needs "did anything move after
 * W", which is the raw watermark, not the buffered since.
 */
export async function entriesUnchangedSince(params: ReadWindow): Promise<boolean> {
  const { showId, since, forceFullSync, bufferMs } = params;
  if (!features.replicationEntriesChangedSince || forceFullSync === true || !(since > 0)) {
    return false;
  }
  const watermark = since + bufferMs;
  const last = lastViewRead.get(showId);
  if (!last || last.watermark !== watermark || last.readAt < watermark + bufferMs) return false;
  try {
    const { data, error } = await supabase.rpc(ENTRY_RESULTS_CHANGED_SINCE_RPC, {
      p_show_id: showId,
      p_since: new Date(watermark).toISOString(),
    });
    if (!error && typeof data === 'boolean') return data === false;
    warnOnce(error?.message ?? 'non-boolean answer');
  } catch (error) {
    warnOnce(error instanceof Error ? error.message : String(error));
  }
  return false;
}

/** Call once an incremental view read completed; never on error, abort or a full sync. */
export function recordEntriesViewRead(params: ReadWindow & { readAt: number }): void {
  const { showId, since, forceFullSync, bufferMs, readAt } = params;
  if (forceFullSync === true || !(since > 0)) return;
  lastViewRead.set(showId, { watermark: since + bufferMs, readAt });
}

function warnOnce(message: string): void {
  if (warned) return;
  warned = true;
  logger.warn('Entries changed-since probe unavailable; reading the results view', 'replication', {
    message,
  });
}

/** Test seam: re-arm the once-per-session warning. */
export function resetEntriesChangedSinceWarning(): void {
  warned = false;
  lastViewRead.clear();
}
