import { useQuery } from '@tanstack/react-query';
import { supabase as supabaseClient } from '@/services/database/supabaseClient';
import { useAuthContext } from '@/hooks/useAuthContext';
import { queryKeys } from '@/lib/queryClient';
import { withReplicationFallback } from '@/services/database/_shared/replication-fallback';
import {
  replicatedJudgeAssignmentsTable,
  replicatedClassesTable,
  type ReplicatedJudgeAssignment,
} from '@/services/replication';
import { zonedWallTimeToInstant, type JudgeClass } from '@/pages/judgeStatsUtils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = supabaseClient as any;

const DEFAULT_TIMEZONE = 'America/New_York';

/** Assignment-lifecycle statuses that put a class on the judge's plate. */
const ACTIVE_ASSIGNMENT_STATUSES = ['confirmed', 'invited'];

/** Columns selected by the PostgREST fallback — pinned by a test to catch embed drift. */
export const JUDGE_ASSIGNMENTS_SELECT = `
  id,
  class_id,
  show_id,
  status,
  classes (
    id,
    name,
    element,
    level,
    status,
    start_time,
    total_entries_count,
    checked_in_count,
    scored_count,
    trial_id,
    trials (
      id,
      date,
      timezone,
      show_id
    )
  )
`;

/** Raw row shape from the judge_assignments → classes → trials join. */
export interface JudgeAssignmentRow {
  id: string;
  class_id: string | null;
  show_id: string | null;
  status: string | null;
  classes: {
    id: string;
    name: string;
    element: string | null;
    level: string | null;
    status: string | null;
    start_time: string | null;
    total_entries_count: number | null;
    checked_in_count: number | null;
    scored_count: number | null;
    trial_id: string;
    trials: { id: string; date: string; timezone: string | null; show_id: string } | null;
  } | null;
}

/**
 * classes.start_time is a Postgres TIME ("HH:MM:SS") in the trial's local zone;
 * resolve it to the correct absolute instant so sorting and the next-class
 * countdown are right regardless of the viewing device's timezone. Tolerates a
 * full ISO timestamp (already absolute) in case the column shape ever changes.
 */
export function parseScheduledTime(
  trialDate: string,
  startTime: string | null,
  timeZone: string
): Date {
  if (startTime?.includes('T')) return new Date(startTime);
  const time = startTime && /^\d{1,2}:\d{2}/.test(startTime) ? startTime : '00:00:00';
  return zonedWallTimeToInstant(trialDate, time, timeZone);
}

function toDashboardStatus(classStatus: string | null): JudgeClass['status'] {
  if (classStatus === 'completed') return 'completed';
  if (classStatus === 'in_progress') return 'in-progress';
  return 'pending'; // upcoming / setup / null
}

/** Returns null for rows that can't be judged: no class/trial attached, or class cancelled. */
export function mapAssignmentRowToJudgeClass(row: JudgeAssignmentRow): JudgeClass | null {
  const cls = row.classes;
  const trial = cls?.trials;
  if (!cls || !trial) return null;
  if (cls.status === 'cancelled') return null;

  return {
    id: row.id,
    showId: row.show_id ?? trial.show_id,
    trialId: cls.trial_id,
    classId: row.class_id ?? cls.id,
    name: cls.name,
    element: cls.element ?? '',
    level: cls.level ?? '',
    trialDate: trial.date,
    trialTimezone: trial.timezone ?? DEFAULT_TIMEZONE,
    scheduledTime: parseScheduledTime(
      trial.date,
      cls.start_time,
      trial.timezone ?? DEFAULT_TIMEZONE
    ),
    ringNumber: null,
    totalEntries: cls.total_entries_count ?? 0,
    checkedInEntries: cls.checked_in_count ?? 0,
    completedEntries: cls.scored_count ?? 0,
    status: toDashboardStatus(cls.status),
  };
}

/**
 * Map a replicated (denormalized) assignment row to a JudgeClass. Returns null
 * when the class/trial snapshot isn't present yet (show-level assignment, or a
 * fresh local row not re-synced) or the class is cancelled.
 */
export function mapReplicatedAssignmentToJudgeClass(
  a: ReplicatedJudgeAssignment
): JudgeClass | null {
  if (!a.classId || !a.className || !a.trialDate || !a.trialId) return null;
  if (a.classStatus === 'cancelled') return null;

  return {
    id: a.id,
    showId: a.showId ?? '',
    trialId: a.trialId,
    classId: a.classId,
    name: a.className,
    element: a.classElement ?? '',
    level: a.classLevel ?? '',
    trialDate: a.trialDate,
    trialTimezone: a.trialTimezone ?? DEFAULT_TIMEZONE,
    scheduledTime: parseScheduledTime(
      a.trialDate,
      a.classStartTime,
      a.trialTimezone ?? DEFAULT_TIMEZONE
    ),
    ringNumber: null,
    totalEntries: a.classTotalEntries ?? 0,
    checkedInEntries: a.classCheckedInCount ?? 0,
    completedEntries: a.classScoredCount ?? 0,
    status: toDashboardStatus(a.classStatus),
  };
}

function sortBySchedule(classes: JudgeClass[]): JudgeClass[] {
  return [...classes].sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime());
}

async function fetchFromPostgrest(personId: string): Promise<JudgeClass[]> {
  const { data: rows, error } = await supabase
    .from('judge_assignments')
    .select(JUDGE_ASSIGNMENTS_SELECT)
    .eq('person_id', personId)
    .in('status', ACTIVE_ASSIGNMENT_STATUSES);

  if (error) throw error;

  return sortBySchedule(
    ((rows ?? []) as JudgeAssignmentRow[])
      .map(mapAssignmentRowToJudgeClass)
      .filter((c): c is JudgeClass => c !== null)
  );
}

/**
 * Offline-first read of the judge's class assignments. Reads the
 * globally-synced, denormalized replication store first so the dashboard — and
 * the Start/Continue path into ringside — survive a venue network drop; falls
 * back to a live PostgREST query when the store is cold or unavailable.
 */
export async function fetchJudgeAssignments(personId: string): Promise<JudgeClass[]> {
  return withReplicationFallback(
    async () => {
      const all = await replicatedJudgeAssignmentsTable.getAll();
      // Cold store (initial sync hasn't landed) — defer to the live query so a
      // judge with assignments never sees a false empty state on first load.
      if (all.length === 0) return fetchFromPostgrest(personId);

      // The embedded class snapshot rides the judge_assignments cursor, which
      // does NOT advance on class-only scoring updates. Overlay live mutable
      // fields from the classes store (re-synced per-show on its own cursor) so
      // the active ring shows current status/progress; fall back to the snapshot
      // for shows the judge hasn't entered (class not yet replicated).
      const liveClasses = await replicatedClassesTable.getAll();
      const liveByClassId = new Map(liveClasses.map(c => [c.id, c]));

      const mine = all
        .filter(a => a.personId === personId && ACTIVE_ASSIGNMENT_STATUSES.includes(a.status ?? ''))
        .map(a => {
          const jc = mapReplicatedAssignmentToJudgeClass(a);
          if (!jc) return null;
          const live = liveByClassId.get(jc.classId);
          if (!live) return jc;
          // A class cancelled after the snapshot was taken should disappear.
          if (live.classStatus === 'cancelled') return null;
          return {
            ...jc,
            status: toDashboardStatus(live.classStatus ?? null),
            totalEntries: live.totalEntriesCount ?? jc.totalEntries,
            checkedInEntries: live.checkedInCount ?? jc.checkedInEntries,
            completedEntries: live.scoredCount ?? jc.completedEntries,
          };
        })
        .filter((c): c is JudgeClass => c !== null);

      return sortBySchedule(mine);
    },
    () => fetchFromPostgrest(personId),
    'judge_assignments',
    'select_dashboard_assignments'
  );
}

export interface JudgeAssignmentsResult {
  assignments: JudgeClass[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: string | null;
  refetch: () => void;
}

/** All confirmed/invited class assignments for the signed-in judge, sorted by scheduled time. */
export function useJudgeAssignments(): JudgeAssignmentsResult {
  const { userWithRoles } = useAuthContext();
  const personId = userWithRoles?.databaseUserId ?? '';

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: queryKeys.judges.assignments(personId),
    enabled: !!personId,
    // Class status changes while the judge is in the ring; refresh on every
    // return to the dashboard so "Continue Judging" doesn't go stale.
    refetchOnMount: 'always',
    queryFn: () => fetchJudgeAssignments(personId),
  });

  // databaseUserId resolves asynchronously after sign-in; while it is missing
  // the query is disabled and React Query reports isLoading=false, which would
  // flash "no assignments" at the judge. Treat unresolved identity as loading.
  return {
    assignments: data ?? [],
    isLoading: isLoading || !personId,
    isFetching,
    isError,
    error: error ? (error as Error).message : null,
    refetch,
  };
}
