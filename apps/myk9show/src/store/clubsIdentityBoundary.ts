/**
 * The clubs identity boundary (MYK9-2168, owner decision "Yes, rebuild", 2026-11-19).
 *
 * ONE place decides whose rows the clubs replica holds, driven by the auth state
 * change handler. On any account change (sign-in, sign-out, a switch, a session
 * whose user id differs from the replica's marker):
 *
 *  1. the fence aborts every pull in flight and the store withholds ALL rows
 *     ('unverified'), in the same synchronous step;
 *  2. a club change the PREVIOUS account queued and has not sent blocks the
 *     switch: nothing is cleared, nothing is pulled, no rows are shown, and the
 *     queue keeps the change for its author (it never sends as someone else);
 *  3. otherwise the whole clubs replica (rows, watermark, marker) is cleared and a
 *     full pull runs;
 *  4. the account captured at the start is re-read before the pull commits; a
 *     mismatch discards it and the marker is never written for it.
 *
 * Only after the marker is written does the store publish rows. A device that
 * cannot say which account is signed in, or cannot download this account's
 * clubs, shows no clubs and says why (`clubsWithheldMessage`).
 */
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { databaseManager, REPLICATION_STORES, type PendingMutation } from '@myk9/replication';
import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';
import { replicatedClubsTable } from '@/services/replication/ReplicatedClubsTable';
import {
  advanceClubsFence,
  drainClubsFence,
  setClubsPullsBlocked,
} from '@/services/replication/clubsSyncFence';
import {
  clearReplicaPrincipal,
  readReplicaPrincipal,
  writeReplicaPrincipal,
} from '@/services/replication/clubsReplicaPrincipal';
import {
  isNetworkClassAuthError,
  resolveGetSessionUser,
  resolveSessionUser,
} from '@/hooks/authSessionUser';
import type { ClubsIdentity, ClubsWithheldReason } from './clubsIdentity';

/** Who is signed in, as the clubs replica sees it. `key` null means "cannot tell". */
export interface ClubsPrincipal {
  /** The auth user id, 'anon' for a guest or passcode session, null when unknown. */
  key: string | null;
  /** The id the mutation queue stamps this account's changes with. */
  authUserId: string | null;
}

const UNKNOWN_PRINCIPAL: ClubsPrincipal = { key: null, authUserId: null };

export function principalFromUser(user: User | null): ClubsPrincipal {
  if (!user) return { key: 'anon', authUserId: null };
  if (user.is_anonymous === true) return { key: 'anon', authUserId: user.id };
  return { key: user.id, authUserId: user.id };
}

/** The principal an auth notification stands for. */
export function principalFromAuthEvent(
  event: AuthChangeEvent,
  session: Session | null
): ClubsPrincipal {
  return principalFromUser(resolveSessionUser(event, session));
}

/** The principal right now, from the session. A failed read is unknown, never a guest. */
export async function resolveClubsPrincipal(): Promise<ClubsPrincipal> {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    const user = resolveGetSessionUser(session, error);
    if (!user && error) return UNKNOWN_PRINCIPAL;
    return principalFromUser(user);
  } catch (error) {
    if (!isNetworkClassAuthError(error)) return UNKNOWN_PRINCIPAL;
    const persisted = resolveSessionUser('GET_SESSION', null);
    return persisted ? principalFromUser(persisted) : UNKNOWN_PRINCIPAL;
  }
}

/** What the boundary drives: the clubs store, injected so neither imports the other. */
export interface ClubsIdentitySink {
  apply: (identity: ClubsIdentity) => void;
  getIdentity: () => ClubsIdentity;
  /** Read the replica into the store (a no-op unless verified). */
  reload: () => Promise<void>;
  /** The pull the boundary just ran was this account's full, current pull. */
  markFresh: () => void;
}

let sink: ClubsIdentitySink | null = null;

export function registerClubsIdentitySink(next: ClubsIdentitySink): void {
  sink = next;
}

const UNVERIFIED: ClubsIdentity = { status: 'unverified', reason: null, principalKey: null };

let handledKey: string | null = null;
let runId = 0;
let chain: Promise<void> = Promise.resolve();
let inflight: Promise<void> | null = null;

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

/**
 * Club changes on this device (waiting or refused) whose author is not this
 * account. Reads the whole device queue, like the sign-out guard: another
 * account's work is exactly what this must see. Rejects when it cannot read.
 */
export async function countOtherAccountClubEdits(authUserId: string | null): Promise<number> {
  const db = await databaseManager.getDatabase('MutationManager');
  const tx = db.transaction(
    [REPLICATION_STORES.PENDING_MUTATIONS, REPLICATION_STORES.FAILED_MUTATIONS],
    'readonly'
  );
  const [pending, failed] = (await Promise.all([
    tx.objectStore(REPLICATION_STORES.PENDING_MUTATIONS).getAll(),
    tx.objectStore(REPLICATION_STORES.FAILED_MUTATIONS).getAll(),
  ])) as [PendingMutation[], PendingMutation[]];
  await tx.done;
  return [...pending, ...failed].filter(
    mutation => mutation.tableName === 'clubs' && mutation.authUserId !== authUserId
  ).length;
}

function withhold(run: number, reason: ClubsWithheldReason): void {
  if (run !== runId || !sink) return;
  // Retryable: the next caller of ensureClubsIdentity settles it again.
  handledKey = null;
  setClubsPullsBlocked(reason === 'pending-edits');
  sink.apply({ status: 'unverified', reason, principalKey: null });
}

async function verify(run: number, key: string, fresh: boolean): Promise<void> {
  if (run !== runId || !sink) return;
  setClubsPullsBlocked(false);
  sink.apply({ status: 'verified', reason: null, principalKey: key });
  if (fresh) sink.markFresh();
  await sink.reload();
}

async function settle(principal: ClubsPrincipal, run: number): Promise<void> {
  const key = principal.key as string;
  const stale = () => run !== runId;
  try {
    if (!(await drainClubsFence())) return withhold(run, 'failed');
    if (stale()) return;

    const marker = readReplicaPrincipal();
    if (marker.state === 'known' && marker.key === key) {
      // Same account the replica was verified for: not an account change.
      return await verify(run, key, false);
    }

    const foreignEdits = await countOtherAccountClubEdits(principal.authUserId);
    if (stale()) return;
    if (foreignEdits > 0) {
      logger.warn('Clubs identity switch blocked by unsent club changes', 'clubs');
      return withhold(run, 'pending-edits');
    }

    if (!clearReplicaPrincipal()) return withhold(run, 'failed');
    await replicatedClubsTable.clearCache();
    if (stale()) return;
    setClubsPullsBlocked(false);

    if (!isOnline()) return withhold(run, 'offline');
    const result = await replicatedClubsTable.sync();
    if (stale()) return;
    if (!result.success) return withhold(run, isOnline() ? 'failed' : 'offline');

    // The account captured at the start must still be the signed-in account.
    const after = await resolveClubsPrincipal();
    if (stale()) return;
    if (after.key !== key) {
      withhold(run, 'identity-unknown');
      if (after.key !== null) void reconcileClubsIdentity(after);
      return;
    }
    if (!writeReplicaPrincipal(key)) return withhold(run, 'failed');
    await verify(run, key, true);
  } catch (error) {
    logger.error('Clubs identity check failed', 'clubs', {}, error as Error);
    withhold(run, 'failed');
  }
}

/**
 * Settle whose rows the clubs replica holds for this principal. Idempotent: the
 * same account again (a focus re-emit, a token refresh) does nothing.
 */
export function reconcileClubsIdentity(principal: ClubsPrincipal): Promise<void> {
  if (!sink) return Promise.resolve();
  if (principal.key === null) {
    // Cannot tell. Keep what is known; with nothing known, show no clubs.
    if (handledKey === null && sink.getIdentity().status !== 'verified') {
      advanceClubsFence();
      sink.apply({ status: 'unverified', reason: 'identity-unknown', principalKey: null });
    }
    return inflight ?? Promise.resolve();
  }
  if (principal.key === handledKey) return inflight ?? Promise.resolve();

  const current = sink.getIdentity();
  // A retry while already withheld keeps its reason on screen instead of flickering.
  const alreadyWithheld = current.status === 'unverified' && current.reason !== null;
  handledKey = principal.key;
  const run = ++runId;
  // Synchronous, before anything async: abort what is running, show nothing.
  advanceClubsFence();
  if (!alreadyWithheld) sink.apply(UNVERIFIED);

  const mine = (chain = chain.then(() => settle(principal, run)));
  inflight = mine;
  void mine.finally(() => {
    if (inflight === mine) inflight = null;
  });
  return mine;
}

/** The auth state change handler's one call. */
export function handleClubsAuthEvent(event: AuthChangeEvent, session: Session | null): void {
  void reconcileClubsIdentity(principalFromAuthEvent(event, session));
}

/**
 * Before any club read or pull: wait for an account check in progress, and run
 * one when the session's account is not the one the store was verified for (a
 * missed event, a retry after offline or a failure, a block that has cleared).
 */
export async function ensureClubsIdentity(): Promise<void> {
  if (!sink) return;
  if (inflight) {
    await inflight;
    return;
  }
  const principal = await resolveClubsPrincipal();
  const current = sink.getIdentity();
  if (current.status === 'verified' && current.principalKey === principal.key) return;
  await reconcileClubsIdentity(principal);
}

/** Test seam: forget every decision. */
export function resetClubsIdentityBoundaryForTests(): void {
  handledKey = null;
  runId = 0;
  chain = Promise.resolve();
  inflight = null;
  sink = null;
  setClubsPullsBlocked(false);
}
