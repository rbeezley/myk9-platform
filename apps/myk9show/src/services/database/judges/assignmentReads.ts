import {
  replicatedClassesTable,
  replicatedJudgeAssignmentsTable,
  type ReplicatedJudgeAssignment,
} from '@/services/replication';
import { isActiveJudgeAssignmentStatus } from './assignmentStatus';
import { readClassRowJudges, withClassRowJudges } from './classLevelJudges';

/**
 * Every judge assignment on this device. getAll()/getByShowId() turn a failed
 * IndexedDB read into [], which reads as "no assignments"; this throws instead,
 * so callers reach their error state (MYK9-722, MYK9-769).
 */
export async function readJudgeAssignmentsOrThrow(): Promise<ReplicatedJudgeAssignment[]> {
  const read = await replicatedJudgeAssignmentsTable.getAllWithStatus();
  if (!read.ok) {
    throw new Error(`Could not read judge assignments on this device: ${String(read.error)}`);
  }
  return read.rows;
}

/**
 * Offline-only active class assignments for one judge at one show. A failed
 * device read throws: the at-show class list would otherwise tell a judge at
 * their ring "No classes assigned yet" (MYK9-769). Class-level judges come from
 * the class rows, so a pick still waiting to upload is already reflected
 * (MYK9-1327; see classLevelJudges.ts).
 */
export async function getActiveJudgeAssignmentsForShow(
  showId: string,
  personId: string
): Promise<ReplicatedJudgeAssignment[]> {
  const [stored, classJudges] = await Promise.all([
    readJudgeAssignmentsOrThrow(),
    readClassRowJudges(showId),
  ]);
  return withClassRowJudges(stored, showId, classJudges).filter(
    assignment =>
      assignment.showId === showId &&
      assignment.personId === personId &&
      assignment.classId !== null &&
      isActiveJudgeAssignmentStatus(assignment.status)
  );
}

export interface JudgedShow {
  showId: string;
  /** Earliest trial date among the judge's assignments at this show, when known. */
  firstTrialDate: string | null;
}

/**
 * Offline-only: every show the judge holds a confirmed or invited assignment at,
 * earliest trial first. Class-less (show-level) rows count, matching the judge
 * arm of the `show_announcements` INSERT policy (20260917163900), which asks
 * only for an active row on the show.
 */
export async function getActiveJudgeAssignmentShows(personId: string): Promise<JudgedShow[]> {
  // A failed read throws so the caller shows an error, not "no shows".
  const assignments = await readJudgeAssignmentsOrThrow();
  const byShow = new Map<string, string | null>();
  for (const assignment of assignments) {
    const { showId, trialDate } = assignment;
    if (!showId || assignment.personId !== personId) continue;
    if (!isActiveJudgeAssignmentStatus(assignment.status)) continue;
    const known = byShow.get(showId);
    if (!byShow.has(showId) || (trialDate && (!known || trialDate < known))) {
      byShow.set(showId, trialDate ?? known ?? null);
    }
  }
  return [...byShow]
    .map(([showId, firstTrialDate]) => ({ showId, firstTrialDate }))
    .sort((a, b) => compareDatesNullLast(a.firstTrialDate, b.firstTrialDate));
}

function compareDatesNullLast(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/**
 * Subscribe to changes that can move a judge's assignments: the assignment replica, and the class
 * replica (a pick changes the class row first). Callers re-read; the listener gets no payload.
 */
export function subscribeToJudgeAssignmentChanges(listener: () => void): () => void {
  const stopAssignments = replicatedJudgeAssignmentsTable.subscribe(() => listener());
  const stopClasses = replicatedClassesTable.subscribe(() => listener());
  return () => {
    stopAssignments();
    stopClasses();
  };
}
