/**
 * MYK9-1327: the replicated CLASS row is the single source of a class's judge on this device.
 *
 * A pick (`setClassJudge`) updates only the class row. The local `judge_assignments` replica keeps
 * the old judge until the post-upload sync, so a reader that takes class-level judges from that
 * replica reports the OLD judge while a pick is pending. Readers where that matters (the ringside
 * active assignments, the premium publish comparison) overlay the class row's judge with
 * `withClassRowJudges`. Show-level rows (`classId` null) are never touched.
 *
 * No overlay row is ever STORED: a dirty `judge_assignments` row with no mutation behind it is the
 * trap this design avoids. The overlay is computed per read.
 */
import { replicatedClassesTable, replicatedTrialsTable } from '@/services/replication';
import type { ReplicatedJudgeAssignment } from '@/services/replication';
import { EMPTY_ENRICHMENT } from '@/services/replication/ReplicatedJudgeAssignmentsTable.mapper';

/** class id -> person id (null = no judge), for the show's classes whose judge the device resolved. */
export type ClassRowJudges = Map<string, string | null>;

/**
 * The judge each of this show's class rows names. A row whose judge lookup never ran
 * (`judgeResolved` not true) is left out, so its judge still comes from the assignments rather
 * than reading as "no judge". Throws when the trials or classes cannot be read on this device.
 */
export async function readClassRowJudges(showId: string): Promise<ClassRowJudges> {
  const trials = await replicatedTrialsTable.getTrialsByShow(showId);
  const byTrial = await Promise.all(
    trials.map(trial => replicatedClassesTable.getClassesByTrial(trial.id))
  );
  const judges: ClassRowJudges = new Map();
  for (const cls of byTrial.flat()) {
    if (cls.judgeResolved === true) judges.set(cls.id, cls.judgeId ?? null);
  }
  return judges;
}

/**
 * The show's assignments with every class-level judge taken from the class row. For a class in
 * `classJudges` the replica's class-level rows are replaced by one row for the class row's judge:
 * the replica's own row when it names that person (keeping its fields), else a minimal confirmed
 * row. Rows for other shows, show-level rows, and classes absent from the map pass through.
 */
export function withClassRowJudges(
  assignments: readonly ReplicatedJudgeAssignment[],
  showId: string,
  classJudges: ClassRowJudges
): ReplicatedJudgeAssignment[] {
  const kept = assignments.filter(
    a => !(a.showId === showId && a.classId !== null && classJudges.has(a.classId))
  );
  for (const [classId, personId] of classJudges) {
    if (!personId) continue;
    const own = assignments.find(
      a => a.showId === showId && a.classId === classId && a.personId === personId
    );
    kept.push(
      own ?? {
        ...EMPTY_ENRICHMENT,
        id: `class-row:${classId}`,
        personId,
        showId,
        trialId: null,
        classId,
        status: 'confirmed',
        invitedAt: null,
        confirmedAt: null,
        fee: null,
        notes: null,
      }
    );
  }
  return kept;
}
