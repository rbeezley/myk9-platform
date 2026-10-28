import { logger } from '@myk9/core';
import { features } from '@/config/features';
import { supabase } from '@/services/database/supabaseClient';

export const ENTRY_RESULTS_CHANGED_SINCE_RPC = 'entry_results_changed_since';

let warned = false;

/**
 * MYK9-1369: ask the server whether anything the results view reads for this
 * show moved after `since`, so an unchanged poll skips the view read.
 *
 * Returns true ONLY when the server answered a definite `false`. Every other
 * outcome (flag off, full sync, RPC error or throw, non-boolean) returns false
 * so the caller reads the view exactly as before; the migration need not be
 * applied for the app to keep working.
 */
export async function entriesUnchangedSince(params: {
  showId: string;
  since: number;
  forceFullSync?: boolean;
}): Promise<boolean> {
  const { showId, since, forceFullSync } = params;
  if (!features.replicationEntriesChangedSince || forceFullSync === true || !(since > 0)) {
    return false;
  }
  try {
    const { data, error } = await supabase.rpc(ENTRY_RESULTS_CHANGED_SINCE_RPC, {
      p_show_id: showId,
      p_since: new Date(since).toISOString(),
    });
    if (!error && typeof data === 'boolean') return data === false;
    warnOnce(error?.message ?? 'non-boolean answer');
  } catch (error) {
    warnOnce(error instanceof Error ? error.message : String(error));
  }
  return false;
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
}
