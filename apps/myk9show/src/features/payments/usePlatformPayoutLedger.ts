import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { cacheStrategies } from '@/lib/queryClient';
import {
  buildLedgerRows,
  type LedgerEntryRow,
  type LedgerShow,
  type LedgerPayout,
  type LedgerRow,
  type PayoutStatus,
} from './payoutLedger';

/**
 * Cross-club payout ledger for site admins: per show, what the club is owed from
 * online entry fees, refunds, settle date, and payout status. Answers "whose
 * money is in the platform's Stripe balance right now?" — the operator-only
 * complement to the club-facing ClubPaymentsCard. Read access is RLS-gated to
 * site admins (the page is also behind the SITE_ADMIN route guard).
 *
 * Three reads: online entries (grouped by show) → the shows + their clubs → any
 * existing payout rows, joined by buildLedgerRows.
 */
export function usePlatformPayoutLedger() {
  return useQuery({
    queryKey: ['admin', 'payout-ledger'],
    queryFn: async (): Promise<LedgerRow[]> => {
      const { data: entryRows, error: entriesError } = await supabase
        .from('entries')
        .select('show_id, entry_fee, payment_method, payment_status, refund_amount')
        .eq('payment_method', 'online');
      if (entriesError) throw entriesError;

      const entriesByShow = new Map<string, LedgerEntryRow[]>();
      for (const row of entryRows ?? []) {
        if (!row.show_id) continue;
        const list = entriesByShow.get(row.show_id) ?? [];
        list.push(row as LedgerEntryRow);
        entriesByShow.set(row.show_id, list);
      }

      const showIds = [...entriesByShow.keys()];
      if (showIds.length === 0) return [];

      const [{ data: showRows, error: showsError }, { data: payoutRows, error: payoutsError }] =
        await Promise.all([
          supabase
            .from('shows')
            .select('id, name, club_id, end_date, club:clubs(name)')
            .in('id', showIds),
          supabase
            .from('show_payouts')
            .select('show_id, amount_cents, status, stripe_transfer_id, completed_at')
            .in('show_id', showIds),
        ]);
      if (showsError) throw showsError;
      if (payoutsError) throw payoutsError;

      const shows: LedgerShow[] = (showRows ?? []).map(s => ({
        id: s.id,
        name: s.name,
        club_id: s.club_id,
        clubName: (s.club as { name: string } | null)?.name ?? null,
        endDate: s.end_date,
      }));

      // One payout row per show (the cron upserts a single row per show).
      const payoutByShow = new Map<string, LedgerPayout>();
      for (const p of payoutRows ?? []) {
        payoutByShow.set(p.show_id, {
          show_id: p.show_id,
          amount_cents: p.amount_cents,
          status: p.status as PayoutStatus,
          stripe_transfer_id: p.stripe_transfer_id,
          completed_at: p.completed_at,
        });
      }

      return buildLedgerRows(shows, entriesByShow, payoutByShow);
    },
    ...cacheStrategies.moderate,
  });
}
