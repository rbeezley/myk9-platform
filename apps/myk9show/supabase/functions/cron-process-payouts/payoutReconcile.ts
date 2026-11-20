// MYK9-2183: before the payout run queues, parks or skips anything for a show
// whose last attempt failed or is uncertain, it asks Stripe whether money
// already moved. At most one transfer per show, ever (transfer_group is the
// show id), so a transfer Stripe has is the payout: it is recorded as sent
// with Stripe's own amount and destination, and nothing new is queued.
//
// Reconciling needs no approval; only a NEW transfer does (the brake's claim).
// While it is uncertain whether money moved, the row stays 'processing' (the
// state both refund endpoints block on); 'failed' is only for a definite
// "no money moved".

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';
import { formatDollars } from '../_shared/clubMoneyEmails.ts';
import { payoutRetryNote } from './payoutCopy.ts';
import {
  alertReconciled,
  reportLedgerWriteError,
  reportLookupError,
  reportReconcileError,
  transferFacts,
  type DestinationCheck,
  type FoundTransfer,
  type ShowRef,
} from './payoutAlerts.ts';
import type {
  HeldMoneyLock,
  PayoutSummary,
  ProcessShowDeps,
  StripeTransfers,
} from './payoutTypes.ts';

export type { FoundTransfer } from './payoutAlerts.ts';

/** Enough to see every transfer a show should ever have; more is itself suspect. */
const TRANSFER_PAGE = 10;

export type TransferLookup =
  | { kind: 'none' }
  /** The newest transfer not fully reversed, and how many such transfers exist. */
  | { kind: 'found'; transfer: FoundTransfer; liveCount: number }
  | { kind: 'error'; message: string };

/**
 * What Stripe has for this show's transfer_group. Never throws. The lookup
 * trusts the job's current Stripe mode: an attempt made under the other mode's
 * key is invisible here, and nothing here guards against that: see MYK9-2305.
 */
export async function lookUpShowTransfer(
  stripe: StripeTransfers,
  showId: string
): Promise<TransferLookup> {
  try {
    const page = await stripe.transfers.list({ transfer_group: showId, limit: TRANSFER_PAGE });
    if (page.has_more) {
      return {
        kind: 'error',
        message: `Stripe lists more than ${TRANSFER_PAGE} transfers for this show; check them by hand`,
      };
    }
    // A fully reversed transfer returned the money: it is not a payout.
    const live = page.data.filter(t => !t.reversed && (t.amount_reversed ?? 0) < t.amount);
    const newest = live[0]; // Stripe lists newest first.
    if (!newest) return { kind: 'none' };
    const destination = stripeAccountIdOf(newest.destination);
    return {
      kind: 'found',
      transfer: {
        id: newest.id,
        amount: newest.amount,
        destination,
        amountReversed: newest.amount_reversed ?? 0,
      },
      liveCount: live.length,
    };
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/** A transfer's destination as Stripe returns it: an account id unless expanded. */
export function stripeAccountIdOf(
  destination: string | { id: string } | null | undefined
): string | null {
  const id = typeof destination === 'string' ? destination : (destination?.id ?? null);
  return id && id.trim() !== '' ? id : null;
}

/**
 * MYK9-2195: where a completed transfer went, as Stripe reported it, for every
 * write that records a transfer as completed. No destination in Stripe's answer
 * is recorded explicitly as not checked, never as a match. The approval tally
 * counts a payout as matched only on paid_stripe_account_id equal to the
 * approved account with paid_destination_checked true.
 */
export function paidDestinationColumns(stripeDestination: string | null): {
  paid_stripe_account_id: string | null;
  paid_destination_checked: boolean;
} {
  return stripeDestination
    ? { paid_stripe_account_id: stripeDestination, paid_destination_checked: true }
    : { paid_stripe_account_id: null, paid_destination_checked: false };
}

/**
 * Record a transfer Stripe already made on the payout row, with Stripe's
 * amount and destination. Only moves the row from `fromStatus`. The account
 * column is set only when the destination is the show's club's account.
 */
async function recordStripeTransfer(
  supabase: SupabaseClient,
  rowId: string,
  fromStatus: string,
  transfer: FoundTransfer,
  clubId: string | null
): Promise<{ error: string | null; destination: DestinationCheck }> {
  // The account column follows Stripe: the club's account when it matches,
  // NULL on a confirmed mismatch, untouched when the check itself failed.
  let destination: DestinationCheck = 'unchecked';
  let account: { club_stripe_account_id: string | null } | Record<string, never> = {};
  if (transfer.destination && clubId) {
    const { data: accounts, error: accountError } = await supabase
      .from('club_stripe_accounts')
      .select('id, club_id')
      .eq('stripe_account_id', transfer.destination);
    if (!accountError) {
      const rows = (accounts ?? []) as Array<{ id: string; club_id: string }>;
      const match = rows.find(row => row.club_id === clubId);
      destination = match ? 'club' : 'other';
      account = { club_stripe_account_id: match ? match.id : null };
    }
  }
  const { data, error } = await supabase
    .from('show_payouts')
    .update({
      status: 'completed',
      stripe_transfer_id: transfer.id,
      amount_cents: transfer.amount,
      completed_at: new Date().toISOString(),
      ...paidDestinationColumns(transfer.destination),
      ...account,
    })
    .eq('id', rowId)
    .eq('status', fromStatus)
    .select('id');
  if (error) return { error: error.message ?? 'update failed', destination };
  if (!data || (data as unknown[]).length === 0) {
    return { error: `the payout row was no longer ${fromStatus}`, destination };
  }
  return { error: null, destination };
}

/**
 * Put a failed row back to 'processing' so refunds are refused; true when it
 * moved. What brings it back: the stale-processing check, which picks rows by
 * updated_at, and the set_updated_at trigger stamps updated_at on this very
 * update, so the day is counted from this move. Until then nothing can claim
 * or send it: processShow skips a live 'processing' row, the claim RPC answers
 * 'busy' for one, approve/hold refuse it, and both refund endpoints block on it.
 */
async function holdAsProcessing(supabase: SupabaseClient, rowId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('show_payouts')
    .update({ status: 'processing' })
    .eq('id', rowId)
    .eq('status', 'failed')
    .select('id');
  return !error && !!data && (data as unknown[]).length > 0;
}

/**
 * Record a transfer Stripe already has on `rowId` and tell the operator.
 * Returns true when it was recorded. On a failed write it is a reconciliation
 * error; a row that was 'failed' is first moved to 'processing' so refunds
 * stay blocked. `alwaysAlert` sends the warn alert even with nothing unusual.
 */
export async function settleFoundTransfer(
  deps: ProcessShowDeps,
  summary: PayoutSummary,
  show: ShowRef,
  found: { rowId: string; fromStatus: string; ledgerCents: number | null; alwaysAlert: boolean },
  lookup: Extract<TransferLookup, { kind: 'found' }>
): Promise<boolean> {
  const { supabase } = deps;
  const { transfer, liveCount } = lookup;
  const record = await recordStripeTransfer(
    supabase,
    found.rowId,
    found.fromStatus,
    transfer,
    show.club_id
  );
  if (record.error) {
    const blocked =
      found.fromStatus === 'failed' ? await holdAsProcessing(supabase, found.rowId) : true;
    await reportReconcileError(deps, summary, show, transfer, record.error, blocked);
    return false;
  }
  const facts = transferFacts(transfer, liveCount, record.destination);
  if (found.alwaysAlert || facts.length > 0) {
    await alertReconciled(deps, show, transfer, found.ledgerCents, facts);
  }
  return true;
}

export type FailedAttemptCheck = { kind: 'proceed'; lock: HeldMoneyLock | null } | { kind: 'stop' };

/**
 * A show with no live payout row whose newest attempt failed: under the money
 * lock, ask Stripe before anything is queued. 'proceed' hands back the held
 * lock (null when there was no failed attempt); the caller releases it.
 */
export async function checkFailedAttempt(
  deps: ProcessShowDeps,
  summary: PayoutSummary,
  show: ShowRef
): Promise<FailedAttemptCheck> {
  const { supabase } = deps;
  const { data: latest, error } = await supabase
    .from('show_payouts')
    .select('id, status, amount_cents')
    .eq('show_id', show.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(`Payout history read failed for show ${show.id}; nothing queued`, error);
    return { kind: 'stop' };
  }
  if (latest?.status !== 'failed') return { kind: 'proceed', lock: null };

  const lock = await deps.acquireMoneyLock(show.id);
  if (!lock.ok) {
    summary.money_lock_busy++;
    console.log(`Skipping show ${show.id}: money lock ${lock.reason}`);
    return { kind: 'stop' };
  }
  let handedOff = false;
  try {
    // Another run may have queued or recorded a payout since the read above.
    const { data: live, error: liveError } = await supabase
      .from('show_payouts')
      .select('id')
      .eq('show_id', show.id)
      .neq('status', 'failed')
      .maybeSingle();
    if (liveError || live) return { kind: 'stop' };

    // While Stripe cannot say whether the failed attempt moved money, the row
    // goes back to 'processing' so refunds are refused (MYK9-2183).
    const rowId = latest.id as string;
    const lookup = await lookUpShowTransfer(deps.stripe, show.id);
    if (lookup.kind === 'error') {
      const held = await holdAsProcessing(supabase, rowId);
      await reportLookupError(deps, summary, show, lookup.message, held ? 'blocked' : 'open');
      return { kind: 'stop' };
    }
    if (lookup.kind === 'found') {
      const found = {
        rowId,
        fromStatus: 'failed',
        ledgerCents: latest.amount_cents as number,
        alwaysAlert: true,
      };
      if (await settleFoundTransfer(deps, summary, show, found, lookup)) summary.reconciled++;
      return { kind: 'stop' };
    }
    handedOff = true;
    return { kind: 'proceed', lock };
  } finally {
    if (!handedOff) await lock.release();
  }
}

interface StaleRow {
  id: string;
  show_id: string;
  amount_cents: number;
  shows: { name: string; club_id: string | null } | null;
}

/**
 * Payouts stuck in 'processing' past the stale threshold: a run died between
 * claim and record, or Stripe gave no clear answer, so money may or may not
 * have moved. Each stays 'processing' (refunds blocked) until Stripe answers:
 * a transfer it has is recorded as sent; none means it failed for retry.
 */
export async function recoverStaleProcessing(
  deps: ProcessShowDeps,
  summary: PayoutSummary,
  staleBeforeIso: string
): Promise<void> {
  const { supabase } = deps;
  const { data: stale, error } = await supabase
    .from('show_payouts')
    .select('id, show_id, amount_cents, shows(name, club_id)')
    .eq('status', 'processing')
    .lt('updated_at', staleBeforeIso);
  if (error) {
    console.error('Stale-processing check failed:', error);
    return;
  }
  for (const row of (stale ?? []) as unknown as StaleRow[]) {
    const show = {
      id: row.show_id,
      name: row.shows?.name ?? row.show_id,
      club_id: row.shows?.club_id ?? null,
    };
    const lock = await deps.acquireMoneyLock(row.show_id);
    if (!lock.ok) {
      summary.money_lock_busy++;
      continue;
    }
    try {
      const lookup = await lookUpShowTransfer(deps.stripe, row.show_id);
      if (lookup.kind === 'error') {
        await reportLookupError(deps, summary, show, lookup.message, 'blocked');
        continue;
      }
      if (lookup.kind === 'found') {
        const found = {
          rowId: row.id,
          fromStatus: 'processing',
          ledgerCents: row.amount_cents,
          alwaysAlert: true,
        };
        if (await settleFoundTransfer(deps, summary, show, found, lookup)) summary.reconciled++;
        continue;
      }
      const { error: failError } = await supabase
        .from('show_payouts')
        .update({ status: 'failed', failure_reason: 'stale_processing' })
        .eq('id', row.id)
        .eq('status', 'processing');
      if (failError) {
        const step = 'mark a stuck payout failed';
        await reportLedgerWriteError(deps, summary, show, step, failError.message);
        continue;
      }
      summary.stale_recovered++;
      console.error(`Stale processing payout ${row.id} (show ${row.show_id}) failed for retry`);
      await deps.alertAdmin(
        'Stale payout recovered for retry',
        `<p>Payout row ${row.id} for show ${row.show_id} (${formatDollars(row.amount_cents)}) was
         stuck in 'processing' and Stripe has no transfer for this show, so it was failed for
         retry.</p>
         ${payoutRetryNote('stale_processing', deps.brakeOn)}`,
        { dedupeKey: `payout-stale-recovered-${row.id}` }
      );
    } finally {
      await lock.release();
    }
  }
}
