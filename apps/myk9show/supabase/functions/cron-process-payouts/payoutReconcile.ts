// MYK9-2183: before the payout run queues, parks or skips anything for a show
// whose last attempt failed or is uncertain, it asks Stripe whether money
// already moved. At most one transfer per show, ever (transfer_group is the
// show id), so a transfer Stripe has is the payout: it is recorded as sent
// with Stripe's own amount and destination, and nothing new is queued.
//
// Reconciling needs no approval; only a NEW transfer does (the brake's claim).
// A payout stuck in 'processing' stays 'processing' (the state both refund
// endpoints block on) until Stripe answers, so a refund can never be issued
// against money the club may already have.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';
import { escapeHtml, formatDollars } from '../_shared/clubMoneyEmails.ts';
import { payoutRetryNote } from './payoutCopy.ts';
import type {
  EligibleShow,
  HeldMoneyLock,
  PayoutSummary,
  ProcessShowDeps,
  StripeTransfers,
} from './payoutTypes.ts';

type ShowRef = Pick<EligibleShow, 'id' | 'name'>;

export interface FoundTransfer {
  id: string;
  amount: number;
  destination: string | null;
}

export type TransferLookup =
  | { kind: 'none' }
  | { kind: 'found'; transfer: FoundTransfer }
  | { kind: 'error'; message: string };

/** What Stripe has for this show's transfer_group. Never throws. */
export async function lookUpShowTransfer(
  stripe: StripeTransfers,
  showId: string
): Promise<TransferLookup> {
  try {
    const existing = await stripe.transfers.list({ transfer_group: showId, limit: 1 });
    const transfer = existing.data[0];
    if (!transfer) return { kind: 'none' };
    const destination =
      typeof transfer.destination === 'string'
        ? transfer.destination
        : (transfer.destination?.id ?? null);
    return { kind: 'found', transfer: { id: transfer.id, amount: transfer.amount, destination } };
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Record a transfer Stripe already made on the payout row, with Stripe's
 * amount and destination (MYK9-2183). Only moves the row from `fromStatus`.
 * Returns an error message when the row could not be written.
 */
export async function recordStripeTransfer(
  supabase: SupabaseClient,
  rowId: string,
  fromStatus: string,
  transfer: FoundTransfer
): Promise<string | null> {
  let accountId: string | null = null;
  if (transfer.destination) {
    const { data: accounts } = await supabase
      .from('club_stripe_accounts')
      .select('id')
      .eq('stripe_account_id', transfer.destination)
      .limit(1);
    accountId = (accounts as Array<{ id: string }> | null)?.[0]?.id ?? null;
  }
  const { data, error } = await supabase
    .from('show_payouts')
    .update({
      status: 'completed',
      stripe_transfer_id: transfer.id,
      amount_cents: transfer.amount,
      completed_at: new Date().toISOString(),
      ...(accountId ? { club_stripe_account_id: accountId } : {}),
    })
    .eq('id', rowId)
    .eq('status', fromStatus)
    .select('id');
  if (error) return error.message ?? 'update failed';
  if (!data || (data as unknown[]).length === 0)
    return `the payout row was no longer ${fromStatus}`;
  return null;
}

function transferLine(transfer: FoundTransfer): string {
  return `transfer <code>${escapeHtml(transfer.id)}</code> of ${formatDollars(transfer.amount)} to
    <code>${escapeHtml(transfer.destination ?? 'unknown account')}</code>`;
}

async function alertReconciled(
  deps: Pick<ProcessShowDeps, 'alertAdmin'>,
  show: ShowRef,
  transfer: FoundTransfer,
  ledgerCents: number | null
) {
  const ledger =
    ledgerCents !== null && ledgerCents !== transfer.amount
      ? `<p>The payout record said ${formatDollars(ledgerCents)}; it now shows Stripe's amount.</p>`
      : '';
  await deps.alertAdmin(
    `Payout reconciled with Stripe: ${show.name}`,
    `<p>Stripe already has ${transferLine(transfer)} for
     <strong>${escapeHtml(show.name)}</strong> (show <code>${show.id}</code>). The payout is
     now recorded as sent and nothing new was queued or sent.</p>${ledger}
     <p>Check the transfer in the Stripe dashboard. If a refund was issued after it was sent,
     the club was overpaid: recover the difference with a transfer reversal.</p>`,
    { dedupeKey: `payout-reconciled-${show.id}`, severity: 'warn' }
  );
}

export async function reportLookupError(
  deps: Pick<ProcessShowDeps, 'alertAdmin'>,
  summary: PayoutSummary,
  show: ShowRef,
  message: string
) {
  summary.transfer_lookup_errors++;
  console.error(`Stripe transfer lookup failed for show ${show.id}: ${message}`);
  await deps.alertAdmin(
    `Payout could not be checked with Stripe: ${show.name}`,
    `<p>The payout run could not ask Stripe whether money already went out for
     <strong>${escapeHtml(show.name)}</strong> (show <code>${show.id}</code>), so nothing was
     queued or sent this run.</p>
     <pre>${escapeHtml(message)}</pre>
     <p>The next run asks again. If this repeats, check the Stripe status page and key.</p>`,
    { dedupeKey: `payout-transfer-lookup-error-${show.id}`, severity: 'error' }
  );
}

/** Stripe moved money but the payout record could not say so. */
export async function reportReconcileError(
  deps: Pick<ProcessShowDeps, 'alertAdmin'>,
  summary: PayoutSummary,
  show: ShowRef,
  transfer: FoundTransfer,
  message: string
) {
  summary.reconciliation_errors++;
  console.error(`Payout for show ${show.id} sent as ${transfer.id} but not recorded: ${message}`);
  await deps.alertAdmin(
    `Payout sent but not recorded: ${show.name}`,
    `<p>Stripe has ${transferLine(transfer)} for <strong>${escapeHtml(show.name)}</strong>
     (show <code>${show.id}</code>), but the payout record could not be updated:</p>
     <pre>${escapeHtml(message)}</pre>
     <p>Nothing will be sent again for this show: the run checks Stripe first. Mark the
     show_payouts row completed with this transfer id and amount, and do not refund
     against this show until it is.</p>`,
    { dedupeKey: `payout-reconcile-error-${show.id}`, severity: 'error' }
  );
}

/** A payout record write failed before any money moved. */
export async function reportLedgerWriteError(
  deps: Pick<ProcessShowDeps, 'alertAdmin'>,
  summary: PayoutSummary,
  show: ShowRef,
  step: string,
  message: string
) {
  summary.ledger_write_errors++;
  console.error(`Payout record write failed for show ${show.id} (${step}): ${message}`);
  await deps.alertAdmin(
    `Payout record could not be saved: ${show.name}`,
    `<p>The payout run could not save the payout record for
     <strong>${escapeHtml(show.name)}</strong> (show <code>${show.id}</code>) while it was
     trying to ${escapeHtml(step)}. No money moved in this step.</p>
     <pre>${escapeHtml(message)}</pre>
     <p>The next run tries again. If this repeats, read the cron-process-payouts logs.</p>`,
    { dedupeKey: `payout-ledger-write-${show.id}`, severity: 'error' }
  );
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

    const lookup = await lookUpShowTransfer(deps.stripe, show.id);
    if (lookup.kind === 'error') {
      await reportLookupError(deps, summary, show, lookup.message);
      return { kind: 'stop' };
    }
    if (lookup.kind === 'found') {
      const writeError = await recordStripeTransfer(
        supabase,
        latest.id as string,
        'failed',
        lookup.transfer
      );
      if (writeError) {
        await reportReconcileError(deps, summary, show, lookup.transfer, writeError);
      } else {
        summary.reconciled++;
        await alertReconciled(deps, show, lookup.transfer, latest.amount_cents as number);
      }
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
  shows: { name: string } | null;
}

/**
 * Payouts stuck in 'processing' past the stale threshold: a run died between
 * claim and record, so money may or may not have moved. Each stays
 * 'processing' (refunds blocked) until Stripe answers: a transfer it has is
 * recorded as sent; none means it failed and the show may be retried.
 */
export async function recoverStaleProcessing(
  deps: ProcessShowDeps,
  summary: PayoutSummary,
  staleBeforeIso: string
): Promise<void> {
  const { supabase } = deps;
  const { data: stale, error } = await supabase
    .from('show_payouts')
    .select('id, show_id, amount_cents, shows(name)')
    .eq('status', 'processing')
    .lt('updated_at', staleBeforeIso);
  if (error) {
    console.error('Stale-processing check failed:', error);
    return;
  }
  for (const row of (stale ?? []) as unknown as StaleRow[]) {
    const show = { id: row.show_id, name: row.shows?.name ?? row.show_id };
    const lock = await deps.acquireMoneyLock(row.show_id);
    if (!lock.ok) {
      summary.money_lock_busy++;
      continue;
    }
    try {
      const lookup = await lookUpShowTransfer(deps.stripe, row.show_id);
      if (lookup.kind === 'error') {
        await reportLookupError(deps, summary, show, lookup.message);
        continue;
      }
      if (lookup.kind === 'found') {
        const writeError = await recordStripeTransfer(
          supabase,
          row.id,
          'processing',
          lookup.transfer
        );
        if (writeError) {
          await reportReconcileError(deps, summary, show, lookup.transfer, writeError);
        } else {
          summary.reconciled++;
          await alertReconciled(deps, show, lookup.transfer, row.amount_cents);
        }
        continue;
      }
      const { error: failError } = await supabase
        .from('show_payouts')
        .update({ status: 'failed', failure_reason: 'stale_processing' })
        .eq('id', row.id)
        .eq('status', 'processing');
      if (failError) {
        await reportLedgerWriteError(
          deps,
          summary,
          show,
          'mark a stuck payout failed',
          failError.message
        );
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
