// The payout cron's club-facing emails (MYK9-1986), as orchestration with injected
// dependencies so each rule is testable without Deno, Stripe or a database.
//
// - Every email goes through `sendClubMoneyEmail`, one message per recipient.
// - A transfer failure emails the club only when it is the club's to fix, and only
//   once per failure episode. A platform failure emails no one at the club; the
//   owner's alert (alertAdmin, unchanged) covers it.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';
import {
  bankNeedsAttentionEmail,
  sendClubMoneyEmail,
  type ClubMoneyEmail,
  type SendEmail,
} from './clubMoneyEmails.ts';
import {
  isNewClubFailureEpisode,
  type PayoutAttempt,
  type PayoutFailureOwner,
} from './payoutFailureOwner.ts';

export interface ClubNoticeDeps {
  /** Active club admins plus the contact address, deduplicated. */
  loadRecipients: () => Promise<string[]>;
  send: SendEmail;
}

/** Send one money email to every recipient. Returns how many messages were sent. */
export async function emailClub(deps: ClubNoticeDeps, email: ClubMoneyEmail): Promise<number> {
  const recipients = await deps.loadRecipients();
  return sendClubMoneyEmail(recipients, email, deps.send);
}

/**
 * The show's payout attempt created just before `rowId`: the once-per-episode
 * check. Throws on a read error so the caller stays quiet instead of guessing.
 */
export async function loadPreviousPayoutAttempt(
  supabase: SupabaseClient,
  showId: string,
  rowId: string
): Promise<PayoutAttempt | null> {
  const { data, error } = await supabase
    .from('show_payouts')
    .select('status, failure_reason')
    .eq('show_id', showId)
    .neq('id', rowId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as PayoutAttempt | null) ?? null;
}

export type TransferFailureNotice = 'sent' | 'already_told' | 'platform' | 'lookup_failed';

export interface TransferFailureInput {
  owner: PayoutFailureOwner;
  clubName: string;
  showName: string;
  amountCents: number;
  paymentsUrl: string;
  /** The show's payout attempt just before the one that failed, or null. */
  loadPreviousAttempt: () => Promise<PayoutAttempt | null>;
}

export async function notifyClubOfTransferFailure(
  deps: ClubNoticeDeps,
  input: TransferFailureInput
): Promise<TransferFailureNotice> {
  if (input.owner !== 'club') return 'platform';
  let previous: PayoutAttempt | null;
  try {
    previous = await input.loadPreviousAttempt();
  } catch (err) {
    // Unknown episode: stay quiet rather than risk an email every night. The
    // owner's alert for this failure still goes out.
    console.error('Previous payout attempt lookup failed; club not emailed:', err);
    return 'lookup_failed';
  }
  if (!isNewClubFailureEpisode(previous)) return 'already_told';
  await emailClub(
    deps,
    bankNeedsAttentionEmail({
      clubName: input.clubName,
      showName: input.showName,
      amountCents: input.amountCents,
      paymentsUrl: input.paymentsUrl,
    })
  );
  return 'sent';
}
