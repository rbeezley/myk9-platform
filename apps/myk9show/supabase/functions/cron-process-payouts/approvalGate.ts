// Database side of the payout brake (MYK9-2170) for cron-process-payouts. The
// decisions live in _shared/payoutApproval.ts; this file only reads and writes.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';
import {
  parseBrakeSetting,
  type AwaitingPayout,
  type BrakeSetting,
} from '../_shared/payoutApproval.ts';

export async function loadPayoutBrake(supabase: SupabaseClient): Promise<BrakeSetting> {
  const result = await supabase
    .from('platform_settings')
    .select('payouts_require_approval')
    .eq('id', true)
    .maybeSingle();
  return parseBrakeSetting(result);
}

/**
 * The approval stamp of the show's latest attempt when that attempt failed
 * after a site admin approved it: the retry row inherits it instead of waiting
 * for a second approval. null otherwise, including on a read error (the payout
 * then waits for approval, the safe side).
 */
export async function loadCarriedApproval(
  supabase: SupabaseClient,
  showId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('show_payouts')
    .select('status, approved_at')
    .eq('show_id', showId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data || data.status !== 'failed') return null;
  return (data.approved_at as string | null) ?? null;
}

/**
 * Record the payout as waiting for approval with the amount just worked out:
 * the live row moves to (or stays in) 'awaiting_approval', guarded on the
 * status it was read with so an approval that landed meanwhile is not undone;
 * with no live row one is inserted (the one-live-row index refuses a duplicate).
 */
export async function recordAwaitingApproval(
  supabase: SupabaseClient,
  input: {
    liveRow: { id: string; status: string } | null;
    showId: string;
    accountId: string;
    amountCents: number;
  }
): Promise<boolean> {
  if (input.liveRow) {
    const { data, error } = await supabase
      .from('show_payouts')
      .update({
        status: 'awaiting_approval',
        amount_cents: input.amountCents,
        club_stripe_account_id: input.accountId,
      })
      .eq('id', input.liveRow.id)
      .eq('status', input.liveRow.status)
      .select('id');
    return !error && (data?.length ?? 0) > 0;
  }
  const { error } = await supabase.from('show_payouts').insert({
    show_id: input.showId,
    club_stripe_account_id: input.accountId,
    amount_cents: input.amountCents,
    status: 'awaiting_approval',
    scheduled_date: new Date().toISOString().slice(0, 10),
  });
  return !error;
}

/** Stamp last_reminded_at on every awaiting payout due a reminder, in one
 * guarded UPDATE, and return what was stamped. */
export async function claimDueReminders(
  supabase: SupabaseClient,
  cutoffIso: string
): Promise<AwaitingPayout[] | null> {
  const { data, error } = await supabase
    .from('show_payouts')
    .update({ last_reminded_at: new Date().toISOString() })
    .eq('status', 'awaiting_approval')
    .or(`last_reminded_at.is.null,last_reminded_at.lt."${cutoffIso}"`)
    .select('id, show_id, amount_cents, created_at, shows(name)');
  if (error) {
    console.error('Payout approval reminder claim failed:', error);
    return null;
  }
  return (data ?? []).map(row => {
    const show = row.shows as { name?: string } | { name?: string }[] | null;
    const showName = Array.isArray(show) ? show[0]?.name : show?.name;
    return {
      id: row.id as string,
      showId: row.show_id as string,
      showName: showName ?? null,
      amountCents: row.amount_cents as number,
      createdAt: row.created_at as string,
    };
  });
}
