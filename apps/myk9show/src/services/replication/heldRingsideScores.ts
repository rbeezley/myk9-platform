/**
 * Held ringside scores from an earlier passcode session (MYK9-1205).
 *
 * A passcode judge whose anonymous session cannot be resumed re-enters the
 * passcode and becomes a NEW anonymous user; owner isolation then holds the old
 * user's queued scores. Once the new passcode has validated online, this device's
 * scores for that show are adopted silently, so they upload under the re-validated
 * claim (rules in packages/replication mutation-adopt.ts).
 *
 * The show and the new owner come from the LIVE session's server-stamped claim,
 * never from a caller, so there is no way to ask for another show's scores. The
 * server still authorizes every upload against that claim and the OCC version.
 */
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/services/database/supabaseClient';
import { logger } from '@/utils/logger';
import { mutationManager } from './sharedMutationManager';
import { RINGSIDE_RPC_FUNCTION } from './ringsideEntryRpc';
import { RINGSIDE_CLASS_RPC_FUNCTION } from './ringsideClassRpc';

const ADOPTABLE_RPCS = [RINGSIDE_RPC_FUNCTION, RINGSIDE_CLASS_RPC_FUNCTION] as const;

/** The anonymous session's id and the show its passcode claim covers, or null. */
function readPasscodeClaim(session: Session | null): { userId: string; showId: string } | null {
  const user = session?.user;
  if (!user || user.is_anonymous !== true) return null;
  const claim = user.app_metadata as { kind?: unknown; show_id?: unknown } | undefined;
  if (claim?.kind !== 'ringside_passcode' || typeof claim.show_id !== 'string') return null;
  return claim.show_id ? { userId: user.id, showId: claim.show_id } : null;
}

/**
 * Adopt this device's held scores for the live passcode claim's show, then
 * request an upload. Call it, without awaiting, right after a passcode validated
 * online. A pure service call: it needs no component, so it survives the page
 * that started it unmounting. Never throws; a failure only warns, and the scores
 * stay held for the next passcode entry.
 */
export async function adoptHeldRingsideScoresForLiveClaim(): Promise<number> {
  try {
    const { data } = await supabase.auth.getSession();
    const claim = readPasscodeClaim(data.session);
    if (!claim) return 0;
    return await mutationManager.adoptHeldMutations({
      showId: claim.showId,
      toAuthUserId: claim.userId,
      rpcNames: ADOPTABLE_RPCS,
    });
  } catch (error) {
    logger.warn('[ringside] adopting held scores failed', 'replication', { error: String(error) });
    return 0;
  }
}
