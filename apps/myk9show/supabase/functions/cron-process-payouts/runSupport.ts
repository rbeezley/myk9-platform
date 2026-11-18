// Steps of the payout run that do not decide anything about a single show's
// transfer, moved out of index.ts to keep it readable (MYK9-2170). Behaviour is
// unchanged; the service-role client and the alert sender are passed in.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';
import { calculateShowPayoutCents } from '../_shared/payoutCalc.ts';
import { parseBrakeSetting, type BrakeSetting } from '../_shared/payoutApproval.ts';

type Alert = (subject: string, html: string, opts?: { dedupeKey?: string }) => Promise<unknown>;

const STALE_PROCESSING_HOURS = 24;

export function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Fail processing rows older than the stale threshold so the unique index
 * reopens for a retry row. Double-pay is prevented by the transfers.list
 * (transfer_group) check before any send, not by the idempotency key.
 * Staleness keys on updated_at (touched by the set_updated_at trigger on the
 * pending→processing claim) — created_at would false-flag a row that sat
 * pending for days before being claimed minutes ago (review finding #1). */
export async function recoverStaleProcessing(
  supabase: SupabaseClient,
  alertAdmin: Alert,
  summary: Record<string, number>
) {
  const cutoff = new Date(Date.now() - STALE_PROCESSING_HOURS * 3600 * 1000).toISOString();
  const { data: stale, error } = await supabase
    .from('show_payouts')
    .update({ status: 'failed', failure_reason: 'stale_processing' })
    .eq('status', 'processing')
    .lt('updated_at', cutoff)
    .select('id, show_id, amount_cents');

  if (error) {
    console.error('Stale-processing recovery failed:', error);
    return;
  }
  for (const row of stale ?? []) {
    summary.stale_recovered++;
    console.error(`Stale processing payout ${row.id} (show ${row.show_id}) failed for retry`);
    await alertAdmin(
      'Stale payout recovered for retry',
      `<p>Payout row ${row.id} for show ${row.show_id} (${dollars(row.amount_cents)}) was stuck
       in 'processing' for over ${STALE_PROCESSING_HOURS}h and has been failed for automatic retry.
       Before re-sending, the next run checks Stripe for an existing transfer for this show
       (transfer_group) and reconciles instead of paying twice. No action needed unless it recurs.</p>`,
      { dedupeKey: `payout-stale-recovered-${row.id}` }
    );
  }
}

/** Sum the show's payable online entry money from entries, in cents.
 * Returns null on a load error (caller skips the show this run).
 * Paginated: PostgREST caps responses at max_rows (1000, config.toml) — an
 * unpaginated select would silently TRUNCATE a big show's entries and
 * underpay the club with no error (round-11 review). */
export async function computePayoutCents(
  supabase: SupabaseClient,
  showId: string
): Promise<number | null> {
  const PAGE = 1000;
  let totalCents = 0;
  for (let from = 0; ; from += PAGE) {
    const { data: entries, error } = await supabase
      .from('entries')
      .select('entry_fee, payment_method, payment_status, refund_amount')
      .eq('show_id', showId)
      .order('id')
      .range(from, from + PAGE - 1);

    if (error) {
      console.error(`Entries load failed for show ${showId}:`, error);
      return null;
    }
    totalCents += calculateShowPayoutCents(entries ?? []);
    if ((entries?.length ?? 0) < PAGE) break;
  }
  return totalCents;
}

// Constant-time secret check: hash both sides so the comparison cost is
// independent of how many leading bytes match (SA-002).
export async function secretMatches(provided: string | null, cronSecret: string): Promise<boolean> {
  if (!provided) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(provided)),
    crypto.subtle.digest('SHA-256', enc.encode(cronSecret)),
  ]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

const PAYOUT_DELAY_DAYS = 3;

export interface EligibleShow {
  id: string;
  name: string;
  club_id: string | null;
  end_date: string;
}

/** The payout brake (MYK9-2170) as the run starts; the claim re-reads it. */
export async function loadPayoutBrake(supabase: SupabaseClient): Promise<BrakeSetting> {
  const result = await supabase
    .from('platform_settings')
    .select('payouts_require_approval')
    .eq('id', true)
    .maybeSingle();
  return parseBrakeSetting(result);
}

/** Live payout statuses that still need the run: not yet sent. */
const OUTSTANDING_STATUSES = ['pending', 'awaiting_approval', 'approved', 'held'];

/**
 * Shows whose payout is due: ended at least PAYOUT_DELAY_DAYS ago (newest
 * 1000), plus every show with an outstanding live payout row however old.
 * The second set matters since MYK9-2170: a payout can wait or be held
 * indefinitely, and must not fall off the end of the newest-shows cap.
 */
export async function loadEligibleShows(
  supabase: SupabaseClient
): Promise<{ shows: EligibleShow[] } | { error: string }> {
  const cutoff = new Date(Date.now() - PAYOUT_DELAY_DAYS * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  // Date-driven eligibility: shows rarely get flipped to a terminal status,
  // so the trigger is end_date + 3 days, excluding only draft/cancelled.
  // Newest-first with an explicit cap: eligibility is permanent, so without
  // ordering PostgREST's max-rows would someday truncate ARBITRARY rows and
  // silently drop new shows. Ordered, the rows that fall off the end are the
  // oldest; any of those still owed money comes back through the second query.
  const { data: shows, error: showsError } = await supabase
    .from('shows')
    .select('id, name, club_id, end_date')
    .lte('end_date', cutoff)
    .not('status', 'in', '("draft","cancelled")')
    .order('end_date', { ascending: false })
    .limit(1000);

  if (showsError) {
    console.error('Eligible-shows query failed:', showsError);
    return { error: showsError.message };
  }

  const PAGE = 1000;
  const byId = new Map<string, EligibleShow>();
  for (const show of (shows ?? []) as EligibleShow[]) byId.set(show.id, show);
  for (let from = 0; ; from += PAGE) {
    const { data: rows, error } = await supabase
      .from('show_payouts')
      .select('show_id, shows(id, name, club_id, end_date)')
      .in('status', OUTSTANDING_STATUSES)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) {
      console.error('Outstanding-payouts query failed:', error);
      return { error: error.message };
    }
    for (const row of rows ?? []) {
      const embedded = row.shows as EligibleShow | EligibleShow[] | null;
      const show = Array.isArray(embedded) ? embedded[0] : embedded;
      if (show && !byId.has(show.id)) byId.set(show.id, show);
    }
    if ((rows?.length ?? 0) < PAGE) break;
  }
  return { shows: [...byId.values()] };
}
