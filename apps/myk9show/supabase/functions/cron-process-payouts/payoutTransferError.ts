// What the payout run does when a transfer attempt throws (MYK9-1986,
// MYK9-2183). Only a request Stripe definitely refused marks the payout
// failed; anything else (a network error, a timeout, a Stripe server error)
// may have moved money, so the row stays 'processing' and the operator is told.

import { clubPaymentsUrl, escapeHtml, formatDollars } from '../_shared/clubMoneyEmails.ts';
import {
  loadPreviousPayoutAttempt,
  notifyClubOfTransferFailure,
} from '../_shared/payoutClubNotices.ts';
import { transferFailureOutcome } from '../_shared/payoutFailureOwner.ts';
import { payoutRetryNote } from './payoutCopy.ts';
import { reportLedgerWriteError, reportUncertainTransfer, type ShowRef } from './payoutAlerts.ts';
import type { PayoutSummary, ProcessShowDeps } from './payoutTypes.ts';

export interface TransferErrorContext {
  show: ShowRef;
  err: unknown;
  /** The claimed row, or null when the error came before the claim. */
  rowId: string | null;
  amountCents: number;
  club: { name: string; email: string | null } | null;
}

export async function handleTransferError(
  deps: ProcessShowDeps,
  summary: PayoutSummary,
  { show, err, rowId, amountCents, club }: TransferErrorContext
): Promise<void> {
  const { supabase, alertAdmin } = deps;
  const reason = err instanceof Error ? err.message : 'Unknown Stripe error';
  const benign = /insufficient.*balance|balance.*insufficient/i.test(reason);
  // MYK9-1986: whose failure this is; only the club's own emails the club, once per episode.
  const { owner, failureReason, definite } = transferFailureOutcome(err, reason, benign);

  if (rowId && !definite) {
    // Leaving the row 'processing' cannot pay twice: nothing re-sends this row
    // (and its idempotency key, show-payout-row-<id>, would replay Stripe's
    // first answer for ~24h if anything did). The stale check lists the show's
    // transfers before it ever fails the row, so a transfer Stripe accepted is
    // recorded, and only a show with none gets a new row and a new request.
    await reportUncertainTransfer(deps, summary, show, amountCents, reason);
    return;
  }

  let stamped = true;
  if (rowId) {
    const failedRowId = rowId;
    const { error: stampError } = await supabase
      .from('show_payouts')
      .update({ status: 'failed', failure_reason: failureReason })
      .eq('id', failedRowId)
      .eq('status', 'processing');
    if (stampError) {
      stamped = false;
      const step = 'mark a failed transfer failed';
      await reportLedgerWriteError(deps, summary, show, step, stampError.message);
    }
    if (club && show.club_id) {
      const clubId = show.club_id;
      await notifyClubOfTransferFailure(deps.clubNoticeDeps(clubId, club.email), {
        owner,
        clubName: club.name,
        showName: show.name,
        amountCents,
        paymentsUrl: clubPaymentsUrl(deps.siteUrl, clubId),
        loadPreviousAttempt: () => loadPreviousPayoutAttempt(supabase, show.id, failedRowId),
      });
    }
  }
  if (stamped) summary.failed++;
  console.error(`Transfer failed for show ${show.id}: ${reason}`);
  await alertAdmin(
    benign ? `Payout deferred (benign): ${show.name}` : `Payout FAILED: ${show.name}`,
    `<p>Transfer of ${formatDollars(amountCents)} for <strong>${escapeHtml(show.name)}</strong> failed:</p>
       <pre>${escapeHtml(reason)}</pre>
       ${payoutRetryNote(benign ? 'balance_delay' : 'transfer_failed', deps.brakeOn)}`,
    {
      dedupeKey: benign
        ? `payout-insufficient-balance-${show.id}`
        : `payout-transfer-failed-${show.id}`,
    }
  );
}
