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
  'id, show_id, entry_status, entry_fee, payment_method, payment_status, refund_amount';
const LEDGER_ENTRY_PULL_SELECT = `${LEDGER_ENTRY_BASE_SELECT}, refund_decision`;

type LedgerEntryWithoutDecision = Omit<LedgerEntryRow, 'refund_decision'> & {
  refund_decision?: string | null;
};

export interface LedgerEntryPage {
  rows: LedgerEntryRow[];
  /**
   * False when the `refund_decision` column could not be read and the query fell
   * back to the base select. Every row is then backfilled with null, so the
   * unresolved-pull count collapses and the advisory disappears — an ABSENT
   * warning that reads as "nothing to resolve". The page must be able to say the
   * check did not run instead.
   */
  refundDecisionChecked: boolean;
}

export async function loadPlatformPayoutLedgerEntryPage(
  from: number,
  to: number
): Promise<LedgerEntryPage> {
  const runSelect = (includeRefundDecision: boolean) =>
    supabase
      .from('entries')
      .select(includeRefundDecision ? LEDGER_ENTRY_PULL_SELECT : LEDGER_ENTRY_BASE_SELECT)
      .eq('payment_method', 'online')
      // Same append-stable ordering as the payout pages below, and for the same
      // reason: a random-UUID sort key lets a concurrent insert reorder pages
      // mid-scan. Pre-dates this change; corrected here because it is the same
      // defect in the same file, and this ledger's totals depend on the scan
      // being complete.
      .order('created_at')
      .order('id')
      .range(from, to);

  let refundDecisionChecked = true;
  let response = await runSelect(true);
  if (isPullRefundSchemaUnavailable(response.error)) {
    refundDecisionChecked = false;
    response = await runSelect(false);
  }
  if (response.error) throw response.error;

  const rows = (response.data ?? []) as unknown as LedgerEntryWithoutDecision[];
  return {
    rows: rows.map(row => ({ ...row, refund_decision: row.refund_decision ?? null })),
    refundDecisionChecked,
  };
}

/** PostgREST response cap. Anything that can exceed it must paginate. */
const PAGE = 1000;
/**
 * Runaway-loop backstop.
 *
 * The hazard is a response that IGNORES `range` and keeps returning the same
 * full page, which never terminates. The guard for that is repeat detection
 * below — comparing each page's first row id against the previous page's — not
 * a row ceiling.
 *
 * A fixed page cap cannot do this job: this is a LIFETIME scan of every online
 * entry, so any ceiling is a growth milestone that permanently disables the
 * ledger the day it is crossed. This number is therefore set far above any
 * plausible dataset and exists only so a pathological loop cannot run forever.
 *
 * When either guard trips we THROW rather than return what we have: every total
 * on this page is a sum over the full scan, so a truncated scan produces an
 * understated liability, and this page's contract is that an incomplete read
 * reads as unavailable, never as a smaller number.
 */
const MAX_PAGES = 5000;
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
  id: string;
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
    let previousFirstPayoutId: string | null = null;
    // Range-paginated as well as chunked: failed retries accumulate, so one
    // chunk of shows can hold more than PAGE payout rows.
    for (let pageIndex = 0; ; pageIndex += 1) {
      if (pageIndex >= MAX_PAGES) {
        throw new Error('Payout ledger: payout scan did not terminate; refusing to report a partial total.');
      }
      const from = pageIndex * PAGE;
      const { data, error } = await supabase
        .from('show_payouts')
        .select('id, show_id, amount_cents, status, stripe_transfer_id, completed_at, created_at')
        .in('show_id', ids)
        // Append-STABLE ordering. `id` alone is a random UUID, so a row the
        // payout cron inserts between two range requests can sort BEFORE the
        // current offset — shifting every later row down one, which duplicates a
        // boundary row and drops another. Losing a live payout that way would
        // show a completed transfer as outstanding. (created_at, id) only ever
        // appends, and id breaks ties on identical timestamps.
        .order('created_at')
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const page = (data ?? []) as unknown as PayoutRow[];
      const firstId = page[0]?.id ?? null;
      if (firstId !== null && firstId === previousFirstPayoutId) {
        throw new Error('Payout ledger: payout pagination returned a repeated page.');
      }
      previousFirstPayoutId = firstId;
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
export interface PayoutLedgerResult {
  rows: LedgerRow[];
  /** False when the pull-refund column could not be read — see LedgerEntryPage. */
  refundDecisionChecked: boolean;
}

export function usePlatformPayoutLedger() {
  return useQuery({
    queryKey: ['admin', 'payout-ledger'],
    queryFn: async (): Promise<PayoutLedgerResult> => {
      // Paginate: PostgREST caps a single response at 1000 rows. An unpaginated
      // read would silently understate collected/refunded/net once online
      // entries exceed the cap (same reason the payout cron paginates).
      const entriesByShow = new Map<string, LedgerEntryRow[]>();
      let refundDecisionChecked = true;
      let previousFirstEntryId: string | null = null;
      for (let page = 0; ; page += 1) {
        if (page >= MAX_PAGES) {
          throw new Error('Payout ledger: entry scan did not terminate; refusing to report a partial total.');
        }
        const from = page * PAGE;
        const entryPage = await loadPlatformPayoutLedgerEntryPage(from, from + PAGE - 1);
        if (!entryPage.refundDecisionChecked) refundDecisionChecked = false;
        const entryRows = entryPage.rows;
        // A server that ignores `range` returns the same page forever. Detect it
        // by identity rather than by counting rows, so ordinary growth is never
        // mistaken for a fault.
        const firstId = entryRows[0]?.id ?? null;
        if (firstId !== null && firstId === previousFirstEntryId) {
          throw new Error('Payout ledger: entry pagination returned a repeated page.');
        }
        previousFirstEntryId = firstId;
        for (const row of entryRows) {
          if (!row.show_id) continue;
          const list = entriesByShow.get(row.show_id) ?? [];
          list.push(row as LedgerEntryRow);
          entriesByShow.set(row.show_id, list);
        }
        if (entryRows.length < PAGE) break;
      }

      const showIds = [...entriesByShow.keys()];
      if (showIds.length === 0) return { rows: [], refundDecisionChecked };

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

      return { rows: buildLedgerRows(shows, entriesByShow, payoutsByShow), refundDecisionChecked };
    },
    ...cacheStrategies.moderate,
  });
}
