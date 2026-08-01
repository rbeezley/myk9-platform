/**
 * Counts for the admin overview.
 *
 * INTENT: these are COUNT queries, not row fetches. The previous dashboard hook
 * pulled every user, every show and every dog across the wire to call `.length`
 * on them — four numbers paid for with three unbounded table reads. PostgREST's
 * `head: true` with an exact count returns the number and no rows at all.
 *
 * Deliberate reads straight from Supabase: this is server-authoritative admin
 * data, not show-day data, so it does not belong in `@myk9/replication`.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { easternDayStartIso } from './easternDay';

export interface AdminOverviewCounts {
  /** Published shows whose date range covers today (Eastern). */
  liveShows: number;
  entriesToday: number;
  signupsToday: number;
  /** Shows CREATED today. There is no `published_at` column, so this is not
   * "published today" and the UI must not label it as such. */
  showsCreatedToday: number;
}

/** `head: true` with an exact count returns the number and zero rows. */
const HEAD_COUNT = { count: 'exact' as const, head: true };

/**
 * Count on `id`, never on `*`.
 *
 * INTENT: `public.entries` grants SELECT on a COLUMN ALLOWLIST rather than at
 * table level, so `select('*')` asks for columns the role cannot read and
 * PostgREST answers 403 — even with `head: true`, where no column value is ever
 * returned. Naming one readable column is all a count needs. Do not "simplify"
 * these back to `*`; the failure is a 403 with an empty message body, and React
 * Query masks it as a retry, so it does not look like a permissions error.
 */
const COUNT_COLUMN = 'id';

/** Queries are written out rather than funnelled through a generic helper: a
 * `(builder) => builder` callback erases the table's type parameter and
 * PostgREST's chain types collapse to `never`. */
function countFrom(result: { count: number | null; error: unknown }): number {
  if (result.error) throw result.error;
  return result.count ?? 0;
}

async function fetchOverviewCounts(now: number): Promise<AdminOverviewCounts> {
  const dayStart = easternDayStartIso(now);
  const nowIso = new Date(now).toISOString();

  // "Live" = published and today falls inside the show's dates. The previous
  // dashboard filtered status 'active'/'upcoming' — values `shows.status` does
  // not have — so it reported 0 live shows while a show was running.
  const [liveShows, entriesToday, signupsToday, showsCreatedToday] = await Promise.all([
    supabase
      .from('shows')
      .select(COUNT_COLUMN, HEAD_COUNT)
      .eq('status', 'published')
      .lte('start_date', nowIso)
      .gte('end_date', dayStart),
    supabase.from('entries').select(COUNT_COLUMN, HEAD_COUNT).gte('created_at', dayStart),
    supabase.from('people').select(COUNT_COLUMN, HEAD_COUNT).gte('created_at', dayStart),
    supabase.from('shows').select(COUNT_COLUMN, HEAD_COUNT).gte('created_at', dayStart),
  ]);

  return {
    liveShows: countFrom(liveShows),
    entriesToday: countFrom(entriesToday),
    signupsToday: countFrom(signupsToday),
    showsCreatedToday: countFrom(showsCreatedToday),
  };
}

export function useAdminOverview(now: number) {
  return useQuery({
    // `now` is frozen at mount by the page, so this key is stable per visit.
    queryKey: ['admin', 'overview', 'counts'],
    queryFn: () => fetchOverviewCounts(now),
    staleTime: 30_000,
  });
}
