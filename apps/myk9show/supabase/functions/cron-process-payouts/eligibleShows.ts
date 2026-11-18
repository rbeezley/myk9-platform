// Which shows the payout run looks at (MYK9-2183).
//
// Date-driven eligibility: shows rarely get flipped to a terminal status, so
// the trigger is end_date + 3 days, excluding only draft/cancelled. The newest
// 1,000 such shows are read, ordered, so PostgREST's max-rows never drops
// arbitrary rows. A show with money still owed (a payout pending, waiting,
// approved, held, or whose last attempt failed) is added on top, under the
// same eligibility checks, so it can never fall past the cutoff and be
// forgotten once 1,000 newer shows exist.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';
import type { EligibleShow } from './payoutTypes.ts';

export const NEWEST_SHOWS_CAP = 1000;
const PAGE = 1000;
/** Ids per `in` filter, so the request URL stays short. */
const ID_CHUNK = 100;

/** Rows that mean the show may still be owed a payout. */
export const OUTSTANDING_PAYOUT_STATUSES = [
  'pending',
  'awaiting_approval',
  'approved',
  'held',
  'failed',
] as const;

type LoadResult = { ok: true; shows: EligibleShow[] } | { ok: false; error: string };

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Shows with a payout row in an outstanding status, minus failed attempts a later payout settled. */
async function loadOwedShowIds(
  supabase: SupabaseClient
): Promise<string[] | { ok: false; error: string }> {
  const live = new Set<string>();
  const failedOnly = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('show_payouts')
      .select('show_id, status')
      .in('status', [...OUTSTANDING_PAYOUT_STATUSES])
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) return { ok: false, error: error.message };
    for (const row of (data ?? []) as Array<{ show_id: string; status: string }>) {
      (row.status === 'failed' ? failedOnly : live).add(row.show_id);
    }
    if ((data?.length ?? 0) < PAGE) break;
  }
  for (const id of live) failedOnly.delete(id);

  // A failed attempt followed by a sent (or in-flight) payout is settled.
  for (const ids of chunks([...failedOnly], ID_CHUNK)) {
    const { data, error } = await supabase
      .from('show_payouts')
      .select('show_id')
      .in('show_id', ids)
      .in('status', ['processing', 'completed']);
    if (error) return { ok: false, error: error.message };
    for (const row of (data ?? []) as Array<{ show_id: string }>) failedOnly.delete(row.show_id);
  }
  return [...live, ...failedOnly];
}

export async function loadEligibleShows(
  supabase: SupabaseClient,
  cutoffDate: string
): Promise<LoadResult> {
  const { data: newest, error: newestError } = await supabase
    .from('shows')
    .select('id, name, club_id, end_date')
    .lte('end_date', cutoffDate)
    .not('status', 'in', '("draft","cancelled")')
    .order('end_date', { ascending: false })
    .limit(NEWEST_SHOWS_CAP);
  if (newestError) return { ok: false, error: newestError.message };

  const shows = [...((newest ?? []) as EligibleShow[])];
  const seen = new Set(shows.map(show => show.id));

  const owed = await loadOwedShowIds(supabase);
  if (!Array.isArray(owed)) return owed;
  const missing = owed.filter(id => !seen.has(id));

  for (const ids of chunks(missing, ID_CHUNK)) {
    const { data, error } = await supabase
      .from('shows')
      .select('id, name, club_id, end_date')
      .in('id', ids)
      .lte('end_date', cutoffDate)
      .not('status', 'in', '("draft","cancelled")');
    if (error) return { ok: false, error: error.message };
    for (const show of (data ?? []) as EligibleShow[]) {
      if (!seen.has(show.id)) {
        seen.add(show.id);
        shows.push(show);
      }
    }
  }
  return { ok: true, shows };
}
