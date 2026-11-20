import { createDatabaseError, supabase } from '../supabaseClient';
import { buildAssignedJudges } from '@/utils/buildAssignedJudges';
import { PremiumPublishError } from '@/features/premium/premiumPublishErrors';
import type { ReplicatedJudgeAssignment } from '@/services/replication/ReplicatedJudgeAssignmentsTable';
import { mutationManager } from '@/services/replication/sharedMutationManager';
import { unsentPickClassIds } from '@/services/replication/classJudgePick';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import { formatJudgeResidence } from '@/utils/formatJudgeResidence';
import {
  formatPremiumClassLabel,
  isLivePremiumRow,
  premiumTrialKey,
} from '@/features/premium/premiumClassLabel';
import { readJudgeAssignmentsOrThrow } from './assignmentReads';

interface ServerJudgeRow {
  person_id: string;
  show_id: string;
  class_id: string | null;
  invited_at: string | null;
  confirmed_at: string | null;
  judge: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    city: string | null;
    state: string | null;
    judge_affiliation: string | null;
  } | null;
  assigned_class: {
    name: string | null;
    element: string | null;
    level: string | null;
    section: string | null;
    status: string | null;
    deleted_at: string | null;
    trial: {
      name: string;
      date: string;
      status: string | null;
      deleted_at: string | null;
    } | null;
  } | null;
}

/** One assignment as `judge|class`, so a class moved between judges counts as a change. */
const assignmentKey = (personId: string, classId: string | null | undefined) =>
  `${personId}|${classId ?? ''}`;

const SERVER_PAGE_SIZE = 1000;

/**
 * Each judge's class-level labels, all together and per trial (matched to a premium trial by
 * name and date, since premium trials carry no id), each label once, in the order read.
 */
function collectClassLabels(
  rows: ServerJudgeRow[]
): Map<string, { all: string[]; byTrial: NonNullable<ShowJudgeAssignment['classLabelsByTrial']> }> {
  const byPerson = new Map<
    string,
    {
      all: Set<string>;
      byTrial: Map<string, { trialName: string; trialDate: string; labels: Set<string> }>;
    }
  >();
  for (const row of rows) {
    const cls = row.assigned_class;
    // A deleted or cancelled class or trial is not on the premium (the `livePremiumClasses` /
    // `livePremiumTrials` rule), so it gives the judge no class there.
    if (!cls || !isLivePremiumRow(cls) || (cls.trial && !isLivePremiumRow(cls.trial))) continue;
    // A class with no element or level keeps its label through the name fallback (MYK9-2248).
    const label = formatPremiumClassLabel({
      element: cls.element ?? '',
      level: cls.level ?? '',
      section: cls.section,
      name: cls.name,
    });
    if (!label.trim()) continue;
    const entry = byPerson.get(row.person_id) ?? { all: new Set<string>(), byTrial: new Map() };
    entry.all.add(label);
    if (cls.trial) {
      const key = premiumTrialKey(cls.trial.name, cls.trial.date);
      const here = entry.byTrial.get(key) ?? {
        trialName: cls.trial.name,
        trialDate: cls.trial.date,
        labels: new Set<string>(),
      };
      here.labels.add(label);
      entry.byTrial.set(key, here);
    }
    byPerson.set(row.person_id, entry);
  }
  return new Map(
    [...byPerson].map(([personId, entry]) => [
      personId,
      {
        all: [...entry.all],
        byTrial: [...entry.byTrial.values()].map(t => ({ ...t, labels: [...t.labels] })),
      },
    ])
  );
}

/**
 * People whose every class assignment is to a cancelled class (MYK9-2248). With no class left on
 * the premium they would print as a whole-trial judge, which they are not, so they are left out of
 * the judge list. A show-level row (no class) is roster membership and does not save them, as in
 * `premiumTrialJudges`. Deleted classes and trials keep today's behaviour.
 */
function judgesOnlyOnCancelledClasses(rows: ServerJudgeRow[]): Set<string> {
  const onlyCancelled = new Map<string, boolean>();
  for (const row of rows) {
    if (row.class_id === null) continue;
    const cancelled =
      row.assigned_class?.status === 'cancelled' &&
      !row.assigned_class.deleted_at &&
      !row.assigned_class.trial?.deleted_at &&
      row.assigned_class.trial?.status !== 'cancelled';
    onlyCancelled.set(row.person_id, (onlyCancelled.get(row.person_id) ?? true) && cancelled);
  }
  return new Set([...onlyCancelled].filter(([, only]) => only).map(([id]) => id));
}

async function readServerJudges(
  showId: string
): Promise<{ judges: ShowJudgeAssignment[]; keys: Set<string> }> {
  // Paged: PostgREST caps a response at 1000 rows, and a truncated list would
  // read as missing judges.
  const rows: ServerJudgeRow[] = [];
  for (let from = 0; ; from += SERVER_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('judge_assignments')
      .select(
        `id, person_id, show_id, class_id, invited_at, confirmed_at,
         judge:people!judge_assignments_person_id_fkey(id, first_name, last_name, city, state, judge_affiliation),
         assigned_class:classes!judge_assignments_class_id_fkey(
           name, element, level, section, status, deleted_at,
           trial:trials!classes_trial_id_fkey(name, date, status, deleted_at)
         )`
      )
      .eq('show_id', showId)
      .order('id', { ascending: true })
      .range(from, from + SERVER_PAGE_SIZE - 1);
    if (error) throw createDatabaseError(error, 'judge_assignments', 'select_for_premium_publish');
    const page = (data ?? []) as unknown as ServerJudgeRow[];
    rows.push(...page);
    if (page.length < SERVER_PAGE_SIZE) break;
  }
  const cancelledOnly = judgesOnlyOnCancelledClasses(rows);
  const assignments = rows
    .filter(row => !cancelledOnly.has(row.person_id))
    .map(
      row =>
        ({
          personId: row.person_id,
          showId: row.show_id,
          classId: row.class_id,
          invitedAt: row.invited_at,
          confirmedAt: row.confirmed_at,
        }) as ReplicatedJudgeAssignment
    );
  const people = rows.flatMap(row =>
    row.judge
      ? [
          {
            id: row.judge.id,
            firstName: row.judge.first_name ?? '',
            lastName: row.judge.last_name ?? '',
          },
        ]
      : []
  );
  const residenceByPerson = new Map<string, string | null>();
  for (const row of rows) {
    if (row.judge) {
      residenceByPerson.set(row.person_id, formatJudgeResidence(row.judge.city, row.judge.state));
    }
  }
  const affiliationByPerson = new Map<string, string | null>();
  for (const row of rows) {
    if (row.judge) {
      affiliationByPerson.set(row.person_id, row.judge.judge_affiliation?.trim() || null);
    }
  }
  const classLabels = collectClassLabels(rows);
  return {
    judges: buildAssignedJudges(assignments, showId, people).map(judge => ({
      ...judge,
      residence: residenceByPerson.get(judge.judgeId) ?? null,
      affiliation: affiliationByPerson.get(judge.judgeId) ?? null,
      classLabels: classLabels.get(judge.judgeId)?.all ?? [],
      classLabelsByTrial: classLabels.get(judge.judgeId)?.byTrial ?? [],
    })),
    keys: new Set(rows.map(row => assignmentKey(row.person_id, row.class_id))),
  };
}

/** This device's assignments for the show, or null when the device cannot read them. */
async function readDeviceAssignmentKeys(showId: string): Promise<Set<string> | null> {
  try {
    const assignments = await readJudgeAssignmentsOrThrow();
    return new Set(
      assignments.filter(a => a.showId === showId).map(a => assignmentKey(a.personId, a.classId))
    );
  } catch {
    return null;
  }
}

function sameKeys(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every(id => b.has(id));
}

/**
 * True while this device holds a `set_class_judge` pick, pending or parked for Retry, for a class
 * of the show (MYK9-1327). A pick changes the class row at once, but the assignment replica (and
 * so the comparison below) names the old judge until the pick uploads and the sync lands. An
 * unreadable device answers true: publishing the old judge is the worse error.
 */
async function hasUnsentPickInShow(showId: string): Promise<boolean> {
  try {
    const classIds = await unsentPickClassIds(mutationManager);
    if (classIds.length === 0) return false;
    const trialIds = new Set((await replicatedTrialsTable.getTrialsByShow(showId)).map(t => t.id));
    for (const classId of classIds) {
      const cls = await replicatedClassesTable.getClassById(classId);
      if (cls?.trialId && trialIds.has(cls.trialId)) return true;
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * The judges a published premium lists: the server's, and only when this
 * device holds the same assignments (which judge has which class).
 *
 * The Edit Show form's judge list comes from a device read, and a failed read
 * leaves it empty, so publishing it put out a premium with no judges
 * (MYK9-774). The server is the source instead. When the device CAN read its
 * judges and they differ from the server's, some change has not landed on one
 * side: an edit still uploading or queued, one the server refused, or another
 * device's edit not yet synced here. Publishing then stops, rather than
 * guessing which side is right, and asks for an upload. When the device cannot
 * read its judges at all, the server's list stands.
 *
 * Throws a `judges-syncing` PremiumPublishError when the two disagree or a class-judge pick is
 * still unsent, and a
 * database error when the server cannot be read.
 */
export async function fetchShowJudgesForPublish(showId: string): Promise<ShowJudgeAssignment[]> {
  if (await hasUnsentPickInShow(showId)) {
    mutationManager.requestUpload();
    throw new PremiumPublishError(
      "This device's judges don't match myK9Show yet",
      'experience-snapshot',
      'judges-syncing'
    );
  }
  const [server, deviceKeys] = await Promise.all([
    readServerJudges(showId),
    readDeviceAssignmentKeys(showId),
  ]);
  if (deviceKeys && !sameKeys(deviceKeys, server.keys)) {
    mutationManager.requestUpload();
    throw new PremiumPublishError(
      "This device's judges don't match myK9Show yet",
      'experience-snapshot',
      'judges-syncing'
    );
  }
  return server.judges;
}
