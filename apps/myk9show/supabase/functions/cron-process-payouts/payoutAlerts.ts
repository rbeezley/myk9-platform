// The payout run's operator alerts for Stripe reconciliation and ledger
// writes (MYK9-2183). Every club- or Stripe-supplied value is HTML-escaped.

import { escapeHtml, formatDollars } from '../_shared/clubMoneyEmails.ts';
import type { StripeKeyMode } from '../_shared/stripeMode.ts';
import type { EligibleShow, PayoutSummary, ProcessShowDeps } from './payoutTypes.ts';

export type ShowRef = Pick<EligibleShow, 'id' | 'name' | 'club_id'>;
type AlertDeps = Pick<ProcessShowDeps, 'alertAdmin'>;

export interface FoundTransfer {
  id: string;
  amount: number;
  destination: string | null;
  /** How much of it Stripe shows as reversed (0 when none). */
  amountReversed: number;
}

function transferLine(transfer: FoundTransfer): string {
  return `transfer <code>${escapeHtml(transfer.id)}</code> of ${formatDollars(transfer.amount)} to
    <code>${escapeHtml(transfer.destination ?? 'unknown account')}</code>`;
}

/**
 * Whether a transfer's destination is the show's club's account: 'other' only
 * when the account read succeeded and no account of this club matched.
 */
export type DestinationCheck = 'club' | 'other' | 'unchecked';

/** What an operator must look at about a transfer found at Stripe; empty when nothing. */
export function transferFacts(
  transfer: FoundTransfer,
  liveCount: number,
  destination: DestinationCheck
): string[] {
  const facts: string[] = [];
  if (liveCount > 1) {
    facts.push(
      `Stripe lists ${liveCount} transfers for this show that are not reversed:
       a possible double payment. The newest is recorded and nothing more was sent; reverse the
       extra transfer in the Stripe dashboard.`
    );
  }
  if (transfer.amountReversed > 0) {
    facts.push(`${formatDollars(transfer.amountReversed)} of it was reversed.`);
  }
  const where = `<code>${escapeHtml(transfer.destination ?? 'unknown account')}</code>`;
  if (destination === 'other') {
    facts.push(
      `It went to ${where}, which is not this club’s Stripe account, so the payout record names
       no account.`
    );
  } else if (destination === 'unchecked') {
    facts.push(
      `It went to ${where}. Whether that is this club’s account could not be checked; the
       payout record keeps the account it had.`
    );
  }
  return facts;
}

export async function alertReconciled(
  deps: AlertDeps,
  show: ShowRef,
  transfer: FoundTransfer,
  ledgerCents: number | null,
  facts: string[]
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
     ${facts.map(fact => `<p>${fact}</p>`).join('')}
     <p>Check the transfer in the Stripe dashboard. If a refund was issued after it was sent,
     the club was overpaid: recover the difference with a transfer reversal.</p>`,
    { dedupeKey: `payout-reconciled-${show.id}`, severity: 'warn' }
  );
}

/** Where refunds stand for a show whose payout the run could not settle. */
function refundsLine(refunds: 'blocked' | 'open'): string {
  return refunds === 'blocked'
    ? `<p>The payout is marked processing, so refunds are blocked for this show. A payout held
       this way is checked with Stripe again once it has been processing for a day.</p>`
    : `<p><strong>Refunds are NOT blocked for this show.</strong> The payout record could not be
       marked processing. Fix it by hand now: set the show_payouts row to processing, and refund
       nothing against this show until Stripe confirms whether the club was paid.</p>`;
}

/** `refunds` is set when the row was (or could not be) held as processing. */
export async function reportLookupError(
  deps: AlertDeps,
  summary: PayoutSummary,
  show: ShowRef,
  message: string,
  refunds?: 'blocked' | 'open'
) {
  summary.transfer_lookup_errors++;
  console.error(`Stripe transfer lookup failed for show ${show.id}: ${message}`);
  await deps.alertAdmin(
    `Payout could not be checked with Stripe: ${show.name}`,
    `<p>The payout run could not tell from Stripe whether money already went out for
     <strong>${escapeHtml(show.name)}</strong> (show <code>${show.id}</code>), so nothing was
     queued or sent this run.</p>
     <pre>${escapeHtml(message)}</pre>
     ${refunds ? refundsLine(refunds) : ''}
     <p>The next run asks again. If this repeats, check the Stripe status page and key.</p>`,
    { dedupeKey: `payout-transfer-lookup-error-${show.id}`, severity: 'error' }
  );
}

/**
 * The run's own key is neither live nor test (MYK9-2187): true when the run
 * must stop, after alerting. Nothing is checked, queued or sent.
 */
export async function refuseUnknownKeyMode(deps: AlertDeps, mode: StripeKeyMode): Promise<boolean> {
  if (mode !== 'unknown') return false;
  console.error('Payout run stopped: STRIPE_SECRET_KEY is neither a live nor a test key');
  await deps.alertAdmin(
    'Payout run stopped: Stripe key mode unknown',
    `<p>The payout run's STRIPE_SECRET_KEY is missing, empty, or does not start with sk_live_,
     rk_live_, sk_test_ or rk_test_, so the run cannot tell whether it is in live or test mode. Nothing was checked,
     queued or sent, and payouts already processing stay processing, so refunds stay blocked
     for those shows.</p>
     <p>Set the secret to the intended live or test key
     (<code>supabase secrets set STRIPE_SECRET_KEY=...</code>); the next run goes ahead.</p>`,
    { dedupeKey: 'payout-key-mode-unknown', severity: 'error' }
  );
  return true;
}

/**
 * Stripe moved money but the payout record could not say so. `refundsBlocked`
 * says whether the row is in a state the refund endpoints refuse.
 */
export async function reportReconcileError(
  deps: AlertDeps,
  summary: PayoutSummary,
  show: ShowRef,
  transfer: FoundTransfer,
  message: string,
  refundsBlocked: boolean
) {
  summary.reconciliation_errors++;
  console.error(`Payout for show ${show.id} sent as ${transfer.id} but not recorded: ${message}`);
  const refunds = refundsBlocked
    ? `<p>The payout is marked processing, so refunds are blocked for this show, and a later
       run records the transfer from Stripe once it has been processing for a day. Nothing will
       be sent again: the run checks Stripe first.</p>`
    : `<p><strong>Refunds are NOT blocked for this show.</strong> The payout record could not be
       marked processing either. Fix it by hand now: mark the show_payouts row completed with
       this transfer id and amount, and refund nothing against this show until it is.</p>`;
  await deps.alertAdmin(
    `Payout sent but not recorded: ${show.name}`,
    `<p>Stripe has ${transferLine(transfer)} for <strong>${escapeHtml(show.name)}</strong>
     (show <code>${show.id}</code>), but the payout record could not be updated:</p>
     <pre>${escapeHtml(message)}</pre>
     ${refunds}`,
    { dedupeKey: `payout-reconcile-error-${show.id}`, severity: 'error' }
  );
}

/** A payout record write failed before any money moved. */
export async function reportLedgerWriteError(
  deps: AlertDeps,
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

/** Stripe gave no clear answer to a transfer request; the row stays processing. */
export async function reportUncertainTransfer(
  deps: AlertDeps,
  summary: PayoutSummary,
  show: ShowRef,
  amountCents: number,
  message: string
) {
  summary.uncertain_transfers++;
  console.error(`Transfer outcome unknown for show ${show.id}: ${message}`);
  await deps.alertAdmin(
    `Payout outcome unknown: ${show.name}`,
    `<p>The ${formatDollars(amountCents)} transfer request for
     <strong>${escapeHtml(show.name)}</strong> (show <code>${show.id}</code>) got no clear
     answer from Stripe, so the money may or may not have gone out:</p>
     <pre>${escapeHtml(message)}</pre>
     <p>The payout stays processing, so refunds stay blocked. Once it has been processing for a
     day, the next run checks Stripe: a transfer Stripe has is recorded as sent, and only if
     there is none is the payout failed and asked for again. Nothing is sent twice.</p>`,
    { dedupeKey: `payout-outcome-unknown-${show.id}`, severity: 'warn' }
  );
}
