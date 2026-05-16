import { supabase, createDatabaseError, type DatabaseError } from '../supabaseClient';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { withReplicationFallback } from '../_shared/replication-fallback';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';

export interface ShowScheduleTimelineRow {
  trialId: string;
  trialDate: string;
  trialNumber: string | null;
  trialPlannedStartTime: string | null;
  classId: string;
  className: string;
  element: string | null;
  level: string | null;
  startTime: string | null;
  status: string;
  totalEntriesCount: number;
}

export interface TrialTimelineRow {
  classId: string;
  className: string;
  element: string | null;
  level: string | null;
  startTime: string | null;
  status: string;
  totalEntriesCount: number;
  judgePersonId: string | null;
  judgeFirstName: string | null;
  judgeLastName: string | null;
}

async function loadEntryCountsByClassMap(): Promise<Map<string, number>> {
  const entries = await replicatedEntriesTable.getAll();
  const map = new Map<string, number>();
  for (const entry of entries) {
    if (entry.classId) {
      map.set(entry.classId, (map.get(entry.classId) ?? 0) + 1);
    }
  }
  return map;
}

function splitJudgeName(judgeName: string | undefined): {
  firstName: string | null;
  lastName: string | null;
} {
  if (!judgeName) return { firstName: null, lastName: null };
  const [firstName = '', ...lastParts] = judgeName.trim().split(/\s+/);
  return {
    firstName: firstName || null,
    lastName: lastParts.join(' ') || null,
  };
}

function mapClassToShowScheduleTimelineRow(
  trial: ReplicatedTrial,
  cls: ReplicatedClass,
  entryCountsMap: Map<string, number>
): ShowScheduleTimelineRow {
  return {
    trialId: trial.id,
    trialDate: trial.date,
    trialNumber: trial.trialNumber ?? null,
    trialPlannedStartTime: trial.plannedStartTime ?? null,
    classId: cls.id,
    className: cls.name,
    element: cls.element ?? null,
    level: cls.level ?? null,
    startTime: cls.startTime ?? null,
    status: cls.classStatus ?? 'no-status',
    totalEntriesCount: entryCountsMap.get(cls.id) ?? 0,
  };
}

function mapClassToTrialTimelineRow(
  cls: ReplicatedClass,
  entryCountsMap: Map<string, number>
): TrialTimelineRow {
  const judgeName = splitJudgeName(cls.judgeName);
  return {
    classId: cls.id,
    className: cls.name,
    element: cls.element ?? null,
    level: cls.level ?? null,
    startTime: cls.startTime ?? null,
    status: cls.classStatus ?? 'no-status',
    totalEntriesCount: entryCountsMap.get(cls.id) ?? 0,
    judgePersonId: cls.judgeId ?? null,
    judgeFirstName: judgeName.firstName,
    judgeLastName: judgeName.lastName,
  };
}

async function postgrestGetShowScheduleTimelineRows(
  showId: string
): Promise<{ data: ShowScheduleTimelineRow[]; error: null }> {
  const { data, error } = await supabase
    .from('trials')
    .select(
      `
      id,
      date,
      trial_number,
      planned_start_time,
      classes (
        id,
        name,
        element,
        level,
        start_time,
        status,
        total_entries_count,
        deleted_at
      )
    `
    )
    .eq('show_id', showId)
    .is('deleted_at', null);

  if (error) throw createDatabaseError(error, 'trial', 'select_schedule_timeline');

  const rows: ShowScheduleTimelineRow[] = [];
  for (const trial of data ?? []) {
    const classes =
      (trial.classes as Array<{
        id: string;
        name: string;
        element: string | null;
        level: string | null;
        start_time: string | null;
        status: string | null;
        total_entries_count: number | null;
        deleted_at: string | null;
      }> | null) ?? [];

    for (const cls of classes.filter(c => c.deleted_at === null)) {
      rows.push({
        trialId: trial.id,
        trialDate: trial.date,
        trialNumber: trial.trial_number,
        trialPlannedStartTime: trial.planned_start_time,
        classId: cls.id,
        className: cls.name,
        element: cls.element,
        level: cls.level,
        startTime: cls.start_time,
        status: cls.status ?? 'no-status',
        totalEntriesCount: cls.total_entries_count ?? 0,
      });
    }
  }

  return { data: rows, error: null };
}

async function postgrestGetTrialTimelineRows(
  trialId: string
): Promise<{ data: TrialTimelineRow[]; error: null }> {
  const { data, error } = await supabase
    .from('classes')
    .select(
      `
      id,
      name,
      element,
      level,
      start_time,
      status,
      total_entries_count,
      judge_assignments (
        person_id,
        people!inner (
          first_name,
          last_name
        )
      )
    `
    )
    .eq('trial_id', trialId)
    .is('deleted_at', null);

  if (error) throw createDatabaseError(error, 'trial', 'select_trial_timeline');

  return {
    data: (data ?? []).map(cls => {
      const assignment = (
        cls.judge_assignments as Array<{
          person_id: string;
          people: { first_name: string; last_name: string };
        }> | null
      )?.[0];

      return {
        classId: cls.id,
        className: cls.name,
        element: cls.element,
        level: cls.level,
        startTime: cls.start_time,
        status: cls.status ?? 'no-status',
        totalEntriesCount: cls.total_entries_count ?? 0,
        judgePersonId: assignment?.person_id ?? null,
        judgeFirstName: assignment?.people.first_name ?? null,
        judgeLastName: assignment?.people.last_name ?? null,
      };
    }),
    error: null,
  };
}

export const getShowScheduleTimelineRows = async (showId: string) => {
  try {
    return await withReplicationFallback(
      async () => {
        const [trials, entryCountsMap] = await Promise.all([
          replicatedTrialsTable.getTrialsByShow(showId),
          loadEntryCountsByClassMap(),
        ]);

        if (trials.length === 0) {
          return { data: [], error: null };
        }

        const classGroups = await Promise.all(
          trials.map(trial => replicatedClassesTable.getClassesByTrial(trial.id))
        );
        const data = trials.flatMap((trial, index) =>
          (classGroups[index] ?? []).map(cls =>
            mapClassToShowScheduleTimelineRow(trial, cls, entryCountsMap)
          )
        );

        return { data, error: null };
      },
      () => postgrestGetShowScheduleTimelineRows(showId),
      'trial',
      'select_schedule_timeline'
    );
  } catch (error) {
    return { data: [], error: error as DatabaseError };
  }
};

export const getTrialTimelineRows = async (trialId: string) => {
  try {
    return await withReplicationFallback(
      async () => {
        const [classes, entryCountsMap] = await Promise.all([
          replicatedClassesTable.getClassesByTrial(trialId),
          loadEntryCountsByClassMap(),
        ]);

        return {
          data: classes.map(cls => mapClassToTrialTimelineRow(cls, entryCountsMap)),
          error: null,
        };
      },
      () => postgrestGetTrialTimelineRows(trialId),
      'trial',
      'select_trial_timeline'
    );
  } catch (error) {
    return { data: [], error: error as DatabaseError };
  }
};
