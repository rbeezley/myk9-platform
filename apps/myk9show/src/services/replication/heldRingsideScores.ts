/**
 * Held ringside scores from an earlier passcode session (MYK9-1205).
 *
 * A passcode judge whose anonymous session cannot be resumed re-enters the
 * passcode and becomes a NEW anonymous user; owner isolation then holds the old
 * user's queued scores. With the owner's yes, the new session adopts them for the
 * show its validated claim covers (rules in packages/replication mutation-adopt.ts).
 *
 * The show and the new owner come from the LIVE session's server-stamped claim,
 * never from a caller, so there is no way to ask for another show's scores. The
 * server still authorizes every upload against that claim and the OCC version.
 */
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/services/database/supabaseClient';
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

async function currentClaim(): Promise<{ userId: string; showId: string } | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return readPasscodeClaim(data.session);
  } catch {
    return null;
  }
}

/** Held scores the live claim's show could adopt, with that show, or null when there is none. */
export async function getHeldRingsideScores(): Promise<{ count: number; showId: string } | null> {
  const claim = await currentClaim();
  if (!claim) return null;
  try {
    const count = await mutationManager.countAdoptableHeldMutations({
      showId: claim.showId,
      toAuthUserId: claim.userId,
      rpcNames: ADOPTABLE_RPCS,
    });
    return { count, showId: claim.showId };
  } catch {
    return null;
  }
}

/** How many held scores from an earlier session this device could adopt right now. */
export async function countHeldRingsideScores(): Promise<number> {
  return (await getHeldRingsideScores())?.count ?? 0;
}

/**
 * Adopt them and request an upload. Returns how many moved; throws on failure.
 * `offeredShowId` is the show the owner agreed to: if the live claim has moved to
 * another show since (another tab validated a different passcode), nothing is
 * adopted, so scores outside the consented show never upload.
 */
export async function adoptHeldRingsideScores(offeredShowId: string): Promise<number> {
  const claim = await currentClaim();
  if (!claim || claim.showId !== offeredShowId) return 0;
  return mutationManager.adoptHeldMutations({
    showId: claim.showId,
    toAuthUserId: claim.userId,
    rpcNames: ADOPTABLE_RPCS,
  });
}
