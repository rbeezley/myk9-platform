// Every database read and write processShow makes, behind one interface, so the
// per-show payout flow runs under vitest against an in-memory store
// (processShow.test.ts) and against PostgREST here. Each method is the query
// the job made before MYK9-2170, plus the brake's own writes.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';
import type { AwaitingPayout, PayoutApproval } from '../_shared/payoutApproval.ts';
import { computePayoutCents } from './runSupport.ts';

export interface LivePayoutRow {
  id: string;
  status: string;
  amount_cents: number;
  approved_at: string | null;
  approved_amount_cents: number | null;
  approved_stripe_account_id: string | null;
}

export interface LatestAttempt {
  status: string;
  approved_at: string | null;
  approved_amount_cents: number | null;
  approved_stripe_account_id: string | null;
  failure_reason: string | null;
}

export interface ClubStripeAccount {
  id: string;
  stripe_account_id: string;
  payouts_enabled: boolean;
  onboarding_complete: boolean;
  livemode: boolean;
}

/** 'recorded' it was written; 'raced' a guard or the one-live-row index
 * refused it (another run or an approval got there first); 'error' a
 * database failure the run must report. */
export type QueueWrite = 'recorded' | 'raced' | 'error';

export interface ClaimInput {
  showId: string;
  liveRow: { id: string; status: string } | null;
  accountId: string;
  destination: string;
  amountCents: number;
  carried: PayoutApproval | null;
}

export interface PayoutStore {
  /** The show's live (non-failed) row; 'error' when it could not be read. */
  loadLiveRow(showId: string): Promise<LivePayoutRow | null | 'error'>;
  /** The show's latest attempt of any status, or null (also on a read error). */
  loadLatestAttempt(showId: string): Promise<LatestAttempt | null>;
  computePayoutCents(showId: string): Promise<number | null>;
  loadAccounts(clubId: string): Promise<ClubStripeAccount[]>;
  loadClub(clubId: string): Promise<{ name: string; email: string | null } | null>;
  /** Refresh a row's amount (and account), guarded on its status. */
  updateLiveAmount(rowId: string, status: string, amountCents: number): Promise<void>;
  /** Close a row out with nothing owed, guarded on its status. */
  closeOutZero(rowId: string, status: string): Promise<void>;
  /** Park a new 'pending' row for a club that cannot receive money yet. */
  insertPending(showId: string, accountId: string | null, amountCents: number): Promise<boolean>;
  recordAwaitingApproval(input: {
    liveRow: { id: string; status: string } | null;
    showId: string;
    accountId: string;
    amountCents: number;
  }): Promise<QueueWrite>;
  /** claim_show_payout_for_send: the row id now 'processing', null when
   * refused, 'error' on a database failure. */
  claimForSend(input: ClaimInput): Promise<string | null | 'error'>;
  /** reopen_show_payout_approval. */
  reopenApproval(input: {
    rowId: string;
    fromStatus: 'approved' | 'processing';
    amountCents: number;
    accountId: string;
    reason: string;
  }): Promise<QueueWrite>;
  setAmount(rowId: string, amountCents: number): Promise<void>;
  markFailed(rowId: string, failureReason: string): Promise<void>;
  markCompleted(
    rowId: string,
    input: { transferId: string | null; amountCents?: number }
  ): Promise<void>;
  /** Record a transfer Stripe already made for a show that has no live row. */
  insertReconciledCompleted(input: {
    showId: string;
    accountId: string;
    amountCents: number;
    transferId: string;
  }): Promise<QueueWrite>;
  claimDueReminders(cutoffIso: string): Promise<AwaitingPayout[] | null>;
}

const UNIQUE_VIOLATION = '23505';

export function createSupabasePayoutStore(supabase: SupabaseClient): PayoutStore {
  const payouts = () => supabase.from('show_payouts');
  const nowIso = () => new Date().toISOString();
  const today = () => nowIso().slice(0, 10);

  return {
    async loadLiveRow(showId) {
      const { data, error } = await payouts()
        .select(
          'id, status, amount_cents, approved_at, approved_amount_cents, approved_stripe_account_id'
        )
        .eq('show_id', showId)
        .neq('status', 'failed')
        .maybeSingle();
      if (error) {
        console.error(`Live payout row read failed for show ${showId}:`, error);
        return 'error';
      }
      return (data as LivePayoutRow | null) ?? null;
    },

    async loadLatestAttempt(showId) {
      const { data, error } = await payouts()
        .select(
          'status, approved_at, approved_amount_cents, approved_stripe_account_id, failure_reason'
        )
        .eq('show_id', showId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error(`Latest payout attempt read failed for show ${showId}:`, error);
        return null;
      }
      return (data as LatestAttempt | null) ?? null;
    },

    computePayoutCents: showId => computePayoutCents(supabase, showId),

    async loadAccounts(clubId) {
      const { data } = await supabase
        .from('club_stripe_accounts')
        .select('id, stripe_account_id, payouts_enabled, onboarding_complete, livemode')
        .eq('club_id', clubId)
        .limit(2);
      return (data ?? []) as ClubStripeAccount[];
    },

    async loadClub(clubId) {
      const { data } = await supabase.from('clubs').select('name, email').eq('id', clubId).single();
      return (data as { name: string; email: string | null } | null) ?? null;
    },

    async updateLiveAmount(rowId, status, amountCents) {
      await payouts().update({ amount_cents: amountCents }).eq('id', rowId).eq('status', status);
    },

    async closeOutZero(rowId, status) {
      await payouts()
        .update({ amount_cents: 0, status: 'completed', completed_at: nowIso() })
        .eq('id', rowId)
        .eq('status', status);
    },

    async insertPending(showId, accountId, amountCents) {
      const { error } = await payouts().insert({
        show_id: showId,
        club_stripe_account_id: accountId,
        amount_cents: amountCents,
        status: 'pending',
        scheduled_date: today(),
      });
      return !error;
    },

    async recordAwaitingApproval(input) {
      if (input.liveRow) {
        // A row entering the queue (pending → awaiting) starts a new reminder
        // episode; a row already waiting keeps its reminder clock.
        const entering = input.liveRow.status !== 'awaiting_approval';
        const { data, error } = await payouts()
          .update({
            status: 'awaiting_approval',
            amount_cents: input.amountCents,
            club_stripe_account_id: input.accountId,
            ...(entering ? { last_reminded_at: null } : {}),
          })
          .eq('id', input.liveRow.id)
          .eq('status', input.liveRow.status)
          .select('id');
        if (error) {
          console.error(`Recording payout ${input.liveRow.id} as awaiting approval failed:`, error);
          return 'error';
        }
        return (data?.length ?? 0) > 0 ? 'recorded' : 'raced';
      }
      const { error } = await payouts().insert({
        show_id: input.showId,
        club_stripe_account_id: input.accountId,
        amount_cents: input.amountCents,
        status: 'awaiting_approval',
        scheduled_date: today(),
      });
      if (!error) return 'recorded';
      if (error.code === UNIQUE_VIOLATION) return 'raced';
      console.error(`Recording show ${input.showId}'s payout as awaiting approval failed:`, error);
      return 'error';
    },

    async claimForSend(input) {
      const { data, error } = await supabase.rpc('claim_show_payout_for_send', {
        p_show_id: input.showId,
        p_live_row_id: input.liveRow?.id ?? null,
        p_live_status: input.liveRow?.status ?? null,
        p_account_id: input.accountId,
        p_destination: input.destination,
        p_amount_cents: input.amountCents,
        p_carried_approved_at: input.carried?.approvedAt ?? null,
        p_carried_amount_cents: input.carried?.amountCents ?? null,
        p_carried_destination: input.carried?.stripeAccountId ?? null,
      });
      if (error) {
        console.error(`Payout claim failed for show ${input.showId}:`, error);
        return 'error';
      }
      return (data as string | null) ?? null;
    },

    async reopenApproval(input) {
      const { data, error } = await supabase.rpc('reopen_show_payout_approval', {
        p_payout_id: input.rowId,
        p_from_status: input.fromStatus,
        p_amount_cents: input.amountCents,
        p_account_id: input.accountId,
        p_reason: input.reason,
      });
      if (error) {
        console.error(`Reopening payout ${input.rowId} for approval failed:`, error);
        return 'error';
      }
      return data === true ? 'recorded' : 'raced';
    },

    async setAmount(rowId, amountCents) {
      await payouts().update({ amount_cents: amountCents }).eq('id', rowId);
    },

    async markFailed(rowId, failureReason) {
      await payouts().update({ status: 'failed', failure_reason: failureReason }).eq('id', rowId);
    },

    async markCompleted(rowId, input) {
      await payouts()
        .update({
          status: 'completed',
          stripe_transfer_id: input.transferId,
          completed_at: nowIso(),
          ...(input.amountCents === undefined ? {} : { amount_cents: input.amountCents }),
        })
        .eq('id', rowId);
    },

    async insertReconciledCompleted(input) {
      const { error } = await payouts().insert({
        show_id: input.showId,
        club_stripe_account_id: input.accountId,
        amount_cents: input.amountCents,
        status: 'completed',
        stripe_transfer_id: input.transferId,
        completed_at: nowIso(),
        scheduled_date: today(),
      });
      if (!error) return 'recorded';
      if (error.code === UNIQUE_VIOLATION) return 'raced';
      console.error(`Recording show ${input.showId}'s existing transfer failed:`, error);
      return 'error';
    },

    async claimDueReminders(cutoffIso) {
      const { data, error } = await payouts()
        .update({ last_reminded_at: nowIso() })
        .eq('status', 'awaiting_approval')
        .or(`last_reminded_at.is.null,last_reminded_at.lt."${cutoffIso}"`)
        .select('id, show_id, amount_cents, shows(name)');
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
        };
      });
    },
  };
}
