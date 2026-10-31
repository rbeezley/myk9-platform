/**
 * MYK9-1540: the ringside Nationals Leaderboard's data. The replica is not a complete,
 * score-authorized feed for a judge (assigned classes only) or a steward (points masked), so the
 * board reads `get_nationals_leaderboard_inputs`, a server read for ringside staff that returns
 * every entry of the show with scores only for RELEASED classes.
 */
import type { SecretaryEntry } from '@/services/database/entries';
import { supabase } from '@/services/database/supabaseClient';
import { POSTGREST_MAX_ROWS } from '@/services/replication/postgrestMaxRows';
import type { ResultsClassRow } from '@/features/results-tab/buildResultsClassRows';

export const NATIONALS_LEADERBOARD_INPUTS_RPC = 'get_nationals_leaderboard_inputs';

export interface NationalsLeaderboardInputRow {
  entry_id: string;
  class_id: string;
  dog_id: string | null;
  dog_name: string | null;
  dog_call_name: string | null;
  armband: string | null;
  handler_name: string | null;
  entry_status: string | null;
  check_in_status: string | null;
  is_scored: boolean | null;
  result_status: string | null;
  points_earned: number | null;
  search_time_seconds: number | null;
  class_results_released_at: string | null;
  trial_date: string | null;
  show_start_date: string | null;
}

interface RangedRpc {
  range(
    from: number,
    to: number
  ): PromiseLike<{
    data: NationalsLeaderboardInputRow[] | null;
    error: { message: string } | null;
  }>;
}
type UntypedRpc = (name: string, args: { p_show_id: string }) => RangedRpc;

/**
 * Every row of the show. PostgREST caps one response at `max_rows` (1,000), and a nationals show
 * can hold more entries than that, so this pages the function's stable `ORDER BY e.id` result and
 * only returns once a short page proves the field is complete (a truncated board would rank
 * wrongly without saying so).
 */
export async function fetchNationalsLeaderboardInputs(
  showId: string
): Promise<NationalsLeaderboardInputRow[]> {
  // The generated Database types predate the function; the row shape is pinned above.
  const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
  const rows: NationalsLeaderboardInputRow[] = [];
  for (let from = 0; ; from += POSTGREST_MAX_ROWS) {
    const { data, error } = await rpc(NATIONALS_LEADERBOARD_INPUTS_RPC, {
      p_show_id: showId,
    }).range(from, from + POSTGREST_MAX_ROWS - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < POSTGREST_MAX_ROWS) return rows;
  }
}

export interface NationalsLeaderboardInputs {
  entries: SecretaryEntry[];
  classRows: Pick<ResultsClassRow, 'id' | 'trialDate' | 'releasedAt'>[];
  showStartDate: string | null;
}

/** Only the fields `buildNationalsLeaderboard` reads are filled; the cast is deliberate. */
export function toLeaderboardInputs(
  rows: readonly NationalsLeaderboardInputRow[]
): NationalsLeaderboardInputs {
  const classRows = new Map<string, Pick<ResultsClassRow, 'id' | 'trialDate' | 'releasedAt'>>();
  const entries = rows.map(row => {
    classRows.set(row.class_id, {
      id: row.class_id,
      trialDate: row.trial_date ?? '',
      releasedAt: row.class_results_released_at,
    });
    return {
      id: row.entry_id,
      class_id: row.class_id,
      dog_id: row.dog_id,
      dog: row.dog_id
        ? { id: row.dog_id, name: row.dog_name ?? '', call_name: row.dog_call_name ?? '' }
        : undefined,
      armband: row.armband,
      handler_identity: row.handler_name
        ? { name: row.handler_name, person: null, source: 'assigned-text' }
        : { name: null, person: null, source: 'unknown' },
      entry_status: row.entry_status,
      check_in_status: row.check_in_status,
      is_scored: row.is_scored,
      result_status: row.result_status,
      points_earned: row.points_earned,
      search_time_seconds: row.search_time_seconds,
    } as unknown as SecretaryEntry;
  });
  return {
    entries,
    classRows: [...classRows.values()],
    showStartDate: rows[0]?.show_start_date ?? null,
  };
}
