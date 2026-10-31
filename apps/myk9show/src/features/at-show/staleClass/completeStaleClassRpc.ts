/** The online call to `ringside_complete_stale_class` (MYK9-1514); a thrown error means nothing changed. */
import { supabase } from '@/services/database/supabaseClient';
import { logger } from '@/services/LoggingService';
import { mutationManager } from '@/services/replication/sharedMutationManager';
import { syncAtShowData } from '../atShowDataAdapter';
import { queuedScoreEntryIds } from '../useQueuedScoresByClass';
import type { CompleteStaleClassReply, StaleClassRefusal } from './confirmStaleClass';

const COMPLETE_STALE_CLASS_RPC = 'ringside_complete_stale_class';

/**
 * How long the judge waits on the call before it is given up as "needs a connection". The shared
 * fetch deadline leaves write RPCs out, so without this a stalled venue connection keeps the
 * prompt busy forever. If the call did reach the server, asking again is safe: it re-validates and
 * answers "no unscored dogs left".
 */
export const COMPLETE_STALE_CLASS_TIMEOUT_MS = 12_000;

export async function completeStaleClassRpc(
  showId: string,
  classId: string,
  expectedEntryIds: string[]
): Promise<CompleteStaleClassReply> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, COMPLETE_STALE_CLASS_TIMEOUT_MS);
  let result;
  try {
    result = await supabase
      .rpc(COMPLETE_STALE_CLASS_RPC, {
        p_class_id: classId,
        p_expected_entry_ids: expectedEntryIds,
      })
      .abortSignal(controller.signal);
  } finally {
    clearTimeout(timer);
  }
  const { data, error } = result;
  if (timedOut) throw new DOMException('Stale-class completion timed out', 'TimeoutError');
  if (error) throw error;
  const reply = (data ?? {}) as {
    ok?: boolean;
    marked_count?: number;
    current_entry_ids?: string[];
    reason?: StaleClassRefusal;
  };
  if (reply.ok === true) {
    // Pull the show so this device's replica shows the absent dogs and the completed class
    // now; the stale class is not the one the live listener watches. Best effort: the write
    // already succeeded.
    void syncAtShowData(showId).catch(err =>
      logger.warn('Stale-class refresh after completion failed', 'at-show', {}, err as Error)
    );
    return { ok: true, markedCount: reply.marked_count ?? 0 };
  }
  return {
    ok: false,
    currentEntryIds: reply.current_entry_ids ?? [],
    reason: reply.reason ?? 'changed',
  };
}

/** Entry ids whose score is still queued on this device (the same queue the class cards count). */
export async function readQueuedScoreEntryIds(): Promise<ReadonlySet<string>> {
  return queuedScoreEntryIds(await mutationManager.getPendingMutationsForTable('entries'));
}
