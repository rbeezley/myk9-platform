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
import { isPullRefundSchemaUnavailable } from './pullRefundSchemaCompatibility';

const LEDGER_ENTRY_BASE_SELECT =
  'show_id, entry_status, entry_fee, payment_method, payment_status, refund_amount';
const LEDGER_ENTRY_PULL_SELECT = `${LEDGER_ENTRY_BASE_SELECT}, refund_decision`;

type LedgerEntryWithoutDecision = Omit<LedgerEntryRow, 'refund_decision'> & {
  refund_decision?: string | null;
};

export async function loadPlatformPayoutLedgerEntryPage(
  from: number,
  to: number
): Promise<LedgerEntryRow[]> {
  const runSelect = (includeRefundDecision: boolean) =>
    supabase
      .from('entries')
      .select(includeRefundDecision ? LEDGER_ENTRY_PULL_SELECT : LEDGER_ENTRY_BASE_SELECT)
      .eq('payment_method', 'online')
      .order('id')
      .range(from, to);

  let response = await runSelect(true);
  if (isPullRefundSchemaUnavailable(response.error)) {
    response = await runSelect(false);
  }
  if (response.error) throw response.error;

  const rows = (response.data ?? []) as unknown as LedgerEntryWithoutDecision[];
  return rows.map(row => ({ ...row, refund_decision: row.refund_decision ?? null }));
}

/** PostgREST response cap. Anything that can exceed it must paginate. */
const PAGE = 1000;
/** Ids per `.in(...)` batch. Under PAGE so a one-row-per-id read cannot truncate. */
const ID_CHUNK = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type ShowRow = {
  id: string;
  name: string;
  club_id: string | null;
  end_date: string | null;
  club: { name: string } | null;
};

export async function loadShowsByIds(showIds: string[]): Promise<ShowRow[]> {
  const rows: ShowRow[] = [];
  for (const ids of chunk(showIds, ID_CHUNK)) {
    const { data, error } = await supabase
      .from('shows')
      .select('id, name, club_id, end_date, club:clubs(name)')
      .in('id', ids);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as ShowRow[]));
  }
  return rows;
}

type PayoutRow = {
  show_id: string;
  amount_cents: number;
  status: string;
  stripe_transfer_id: string | null;
  completed_at: string | null;
  created_at: string | null;
};

export async function loadPayoutsByShowIds(showIds: string[]): Promise<PayoutRow[]> {
  const rows: PayoutRow[] = [];
  for (const ids of chunk(showIds, ID_CHUNK)) {
    // Range-paginated as well as chunked: failed retries accumulate, so one
    // chunk of shows can hold more than PAGE payout rows.
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('show_payouts')
        .select('show_id, amount_cents, status, stripe_transfer_id, completed_at, created_at')
        .in('show_id', ids)
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const page = (data ?? []) as unknown as PayoutRow[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }
  }
  return rows;
}

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
      // Paginate: PostgREST caps a single response at 1000 rows. An unpaginated
      // read would silently understate collected/refunded/net once online
      // entries exceed the cap (same reason the payout cron paginates).
      const entriesByShow = new Map<string, LedgerEntryRow[]>();
      for (let from = 0; ; from += PAGE) {
        const entryRows = await loadPlatformPayoutLedgerEntryPage(from, from + PAGE - 1);
        for (const row of entryRows) {
          if (!row.show_id) continue;
          const list = entriesByShow.get(row.show_id) ?? [];
          list.push(row as LedgerEntryRow);
          entriesByShow.set(row.show_id, list);
        }
        if (entryRows.length < PAGE) break;
      }

      const showIds = [...entriesByShow.keys()];
      if (showIds.length === 0) return [];

      // BOTH joined reads must be paginated, and this became load-bearing the
      // moment a missing `shows` row started MEANING something. PostgREST caps a
      // response at 1000 rows, so an unpaginated read silently truncates — and a
      // truncated read is indistinguishable from a row we are not allowed to
      // see. That would label readable shows "unavailable", and worse: a
      // truncated COMPLETED payout row makes its show fall back to the computed
      // liability with payoutStatus null, moving already-transferred money out
      // of "paid out" and into "outstanding".
      //
      // Shows are chunked (one row per id, so a chunk under the cap is safe).
      // Payouts are chunked AND range-paginated, because failed retries
      // accumulate — one show can hold many payout rows.
      const [showRows, payoutRows] = await Promise.all([
        loadShowsByIds(showIds),
        loadPayoutsByShowIds(showIds),
      ]);

      const shows: LedgerShow[] = showRows.map(s => ({
        id: s.id,
        name: s.name,
        club_id: s.club_id,
        clubName: s.club?.name ?? null,
        endDate: s.end_date,
      }));

      // A show can have multiple payout rows: failed retries accumulate as
      // history alongside one live row. Collect them all per show and let
      // buildLedgerRows → pickCanonicalPayout choose the canonical one, so an
      // old failed row can't overwrite the current completed/pending row.
      const payoutsByShow = new Map<string, LedgerPayout[]>();
      for (const p of payoutRows) {
        const list = payoutsByShow.get(p.show_id) ?? [];
        list.push({
          show_id: p.show_id,
          amount_cents: p.amount_cents,
          status: p.status as PayoutStatus,
          stripe_transfer_id: p.stripe_transfer_id,
          completed_at: p.completed_at,
          created_at: p.created_at,
        });
        payoutsByShow.set(p.show_id, list);
      }

      return buildLedgerRows(shows, entriesByShow, payoutsByShow);
    },
    ...cacheStrategies.moderate,
  });
}
