import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys } from '@/lib/queryClient';

/**
 * The judges working each show day, from every way a judge assignment is stored.
 *
 * `judge_assignments` rows come in three scopes (migration 005 and its writers):
 *   - class-scoped: `class_id` set (Class Settings, the show wizard). `trial_id` is often NULL,
 *     so the day is the class's trial (`classes.trial_id`).
 *   - trial-scoped: `trial_id` set, no class.
 *   - show-wide: neither set. The judge works every day.
 * Only `confirmed` and `invited` rows count (the same set the ringside and access functions use);
 * `declined` and `cancelled` are people who are not coming.
 *
 * Exported for reuse (the Hospitality plan report, MYK9-1695).
 */
export interface JudgeAssignmentInput {
  id: string;
  person_id: string;
  status: string | null;
  class_id: string | null;
  trial_id: string | null;
  /** The class row's trial, when the assignment names a class. */
  class: { trial_id: string | null } | null;
  people: { first_name: string | null; last_name: string | null } | null;
}

export interface JudgeOnDay {
  person_id: string;
  judge_name: string;
}

export const ACTIVE_JUDGE_STATUSES: readonly string[] = ['confirmed', 'invited'];

/** The trial a class-scoped or trial-scoped assignment belongs to; null = every day. */
function dayOf(row: JudgeAssignmentInput): string | null | 'unresolved' {
  if (row.class_id) return row.class?.trial_id ?? row.trial_id ?? 'unresolved';
  return row.trial_id;
}

/** Judges per show day (trial id), sorted by name, each person once per day. */
export function resolveJudgesOnDays(
  trialIds: readonly string[],
  rows: readonly JudgeAssignmentInput[]
): Map<string, JudgeOnDay[]> {
  const byDay = new Map<string, Map<string, JudgeOnDay>>(
    trialIds.map(id => [id, new Map<string, JudgeOnDay>()])
  );

  for (const row of rows) {
    if (!row.status || !ACTIVE_JUDGE_STATUSES.includes(row.status)) continue;
    const day = dayOf(row);
    if (day === 'unresolved') continue;
    const name =
      `${row.people?.first_name ?? ''} ${row.people?.last_name ?? ''}`.trim() || 'Unknown Judge';
    const days = day === null ? trialIds : [day];
    for (const trialId of days) {
      byDay.get(trialId)?.set(row.person_id, { person_id: row.person_id, judge_name: name });
    }
  }

  return new Map(
    [...byDay].map(([trialId, judges]) => [
      trialId,
      [...judges.values()].sort((a, b) => a.judge_name.localeCompare(b.judge_name)),
    ])
  );
}

const COLUMNS = 'id, person_id, status, class_id, trial_id, people!inner(first_name, last_name)';

async function fetchJudgeAssignments(
  showId: string,
  trialIds: readonly string[]
): Promise<JudgeAssignmentInput[]> {
  const scope =
    trialIds.length > 0
      ? `show_id.eq.${showId},trial_id.in.(${trialIds.join(',')})`
      : `show_id.eq.${showId}`;
  const [direct, byClass] = await Promise.all([
    // Rows naming the show or a day of it; the class embed resolves a class-scoped row's day.
    supabase.from('judge_assignments').select(`${COLUMNS}, class:classes(trial_id)`).or(scope),
    // Class-scoped rows that carry neither show_id nor trial_id: found through the class's trial.
    trialIds.length > 0
      ? supabase
          .from('judge_assignments')
          .select(`${COLUMNS}, class:classes!inner(trial_id)`)
          .in('class.trial_id' as string, trialIds as string[])
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (direct.error) throw direct.error;
  if (byClass.error) throw byClass.error;

  const rows = new Map<string, JudgeAssignmentInput>();
  for (const row of [
    ...(direct.data ?? []),
    ...(byClass.data ?? []),
  ] as unknown as JudgeAssignmentInput[]) {
    rows.set(row.id, row);
  }
  return [...rows.values()];
}

export interface JudgesOnDaysResult {
  byTrial: Map<string, JudgeOnDay[]>;
  /** True once an answer exists (an empty map before that is not "no judges"). */
  hasData: boolean;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useJudgesOnDays(
  showId: string,
  trialIds: readonly string[],
  enabled = true
): JudgesOnDaysResult {
  const query = useQuery({
    queryKey: [...queryKeys.showJudges(showId), 'lunch-days', [...trialIds].sort()],
    enabled,
    queryFn: async () =>
      resolveJudgesOnDays(trialIds, await fetchJudgeAssignments(showId, trialIds)),
  });
  return {
    byTrial: query.data ?? new Map(),
    hasData: query.data !== undefined,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
